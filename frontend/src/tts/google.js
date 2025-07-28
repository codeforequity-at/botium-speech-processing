const _ = require('lodash')
const textToSpeech = require('@google-cloud/text-to-speech')
const { EventEmitter } = require('events')
const debug = require('debug')('botium-speech-processing-google-tts')

const { googleOptions, ttsFilename } = require('../utils')

// Create WAV header for PCM data
const createWavHeader = (pcmLength, sampleRate = 16000, channels = 1, bitsPerSample = 16) => {
  const header = Buffer.alloc(44)
  const bytesPerSample = bitsPerSample / 8
  const byteRate = sampleRate * channels * bytesPerSample
  const blockAlign = channels * bytesPerSample
  const dataSize = pcmLength
  const fileSize = 36 + dataSize

  header.write('RIFF', 0)                    // ChunkID
  header.writeUInt32LE(fileSize, 4)          // ChunkSize
  header.write('WAVE', 8)                    // Format
  header.write('fmt ', 12)                   // Subchunk1ID
  header.writeUInt32LE(16, 16)               // Subchunk1Size (PCM)
  header.writeUInt16LE(1, 20)                // AudioFormat (PCM)
  header.writeUInt16LE(channels, 22)         // NumChannels
  header.writeUInt32LE(sampleRate, 24)       // SampleRate
  header.writeUInt32LE(byteRate, 28)         // ByteRate
  header.writeUInt16LE(blockAlign, 32)       // BlockAlign
  header.writeUInt16LE(bitsPerSample, 34)    // BitsPerSample
  header.write('data', 36)                   // Subchunk2ID
  header.writeUInt32LE(dataSize, 40)         // Subchunk2Size

  return header
}

const genderMap = {
  MALE: 'male',
  FEMALE: 'female',
  NEUTRAL: 'neutral'
}

class GoogleTTS {
  async voices (req) {
    const client = new textToSpeech.TextToSpeechClient(googleOptions(req))

    const [result] = await client.listVoices({})
    const voices = result.voices

    const googleVoices = []
    voices.forEach(voice => {
      voice.languageCodes.forEach(languageCode => {
        googleVoices.push({
          name: voice.name,
          gender: genderMap[voice.ssmlGender],
          language: languageCode
        })
      })
    })
    return googleVoices
  }

  async languages (req) {
    const voicesList = await this.voices(req)
    return _.uniq(voicesList.map(v => v.language)).sort()
  }

  async tts (req, { language, voice, text }) {
    const voiceSelector = {
      languageCode: language
    }
    if (voice) {
      voiceSelector.name = voice
    }

    const client = new textToSpeech.TextToSpeechClient(googleOptions(req))
    const request = {
      input: {
        text
      },
      voice: voiceSelector,
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 16000 }
    }
    if (req.body.google && req.body.google.config) {
      Object.assign(request, req.body.google.config)
    }

    try {
      const [response] = await client.synthesizeSpeech(request)
      return {
        buffer: response.audioContent,
        name: `${ttsFilename(text)}.wav`
      }
    } catch (err) {
      debug(err)
      throw new Error(`Google Cloud TTS failed: ${err.message}`)
    }
  }

  async tts_OpenStream (req, { language, voice }) {
    const voiceSelector = {
      languageCode: language
    }
    if (voice) {
      voiceSelector.name = voice
    }

    const client = new textToSpeech.TextToSpeechClient(googleOptions(req))
    const events = new EventEmitter()
    const history = []
    let isStreamClosed = false
    let streamCall = null
    let totalPcmLength = 0 // Track total PCM length for WAV header
    let headerSent = false // Track if WAV header was sent

    const audioConfig = { 
      audioEncoding: 'LINEAR16', 
      sampleRateHertz: 16000 
    }

    // Apply request-specific config
    let streamingConfig = {
      voice: voiceSelector,
      audioConfig: audioConfig
    }
    
    if (req.body && req.body.google && req.body.google.config) {
      Object.assign(streamingConfig, req.body.google.config)
    }

    const triggerHistoryEmit = () => {
      history.forEach(data => events.emit('data', data))
    }

    const write = (textChunk) => {
      if (isStreamClosed || !streamCall) return
      
      debug(`Sending text chunk to Google TTS: ${textChunk}`)
      
      try {
        streamCall.write({
          input: {
            text: textChunk
          },
          voice: streamingConfig.voice,
          audioConfig: streamingConfig.audioConfig
        })
      } catch (err) {
        debug(`Error sending text chunk: ${err.message}`)
        const errorData = {
          status: 'error',
          text: '',
          final: true,
          err: err.message
        }
        history.push(errorData)
        events.emit('data', errorData)
      }
    }

    const end = () => {
      if (isStreamClosed || !streamCall) return
      
      debug('Closing Google TTS stream')
      try {
        streamCall.end()
      } catch (err) {
        debug(`Error closing stream: ${err.message}`)
      }
    }

    const close = () => {
      if (isStreamClosed) return
      
      isStreamClosed = true
      debug('Force closing Google TTS stream')
      
      if (streamCall) {
        try {
          streamCall.destroy()
        } catch (err) {
          debug(`Error destroying stream: ${err.message}`)
        }
        streamCall = null
      }
      
      events.emit('close')
    }

    try {
      debug(`Opening Google TTS streaming synthesis with voice: ${JSON.stringify(voiceSelector)}`)
      
      // Create bidirectional streaming call
      streamCall = client.streamingSynthesize()
      
      streamCall.on('data', async (response) => {
        debug(`Received audio response: ${response.audioContent ? response.audioContent.length : 0} bytes`)
        
        if (response.audioContent && response.audioContent.length > 0) {
          // Send WAV header once at the beginning
          if (!headerSent) {
            const placeholderSize = 0xFFFFFFFF - 44 // Max size minus header
            const wavHeader = createWavHeader(placeholderSize)
            
            const headerData = {
              status: 'ok',
              buffer: wavHeader,
              final: false,
              debug: { message: 'WAV header', audioLength: wavHeader.length }
            }
            history.push(headerData)
            events.emit('data', headerData)
            headerSent = true
            debug('Sent WAV header (44 bytes)')
          }
          
          // Send raw PCM data
          totalPcmLength += response.audioContent.length
          const pcmData = {
            status: 'ok',
            buffer: response.audioContent,
            final: false,
            debug: { 
              message: 'PCM chunk',
              audioLength: response.audioContent.length,
              totalPcmSoFar: totalPcmLength
            }
          }
          history.push(pcmData)
          events.emit('data', pcmData)
        }
        
        // Handle other response fields if present
        if (response.timepoints || response.metadata) {
          const metaData = {
            status: 'ok',
            text: '',
            final: false,
            debug: {
              timepoints: response.timepoints,
              metadata: response.metadata
            }
          }
          history.push(metaData)
          events.emit('data', metaData)
        }
      })

      streamCall.on('error', (err) => {
        debug(`Google TTS streaming error: ${err.message}`)
        
        const errorData = {
          status: 'error',
          text: '',
          final: true,
          err: err.message
        }
        history.push(errorData)
        events.emit('data', errorData)
      })

      streamCall.on('end', () => {
        debug('Google TTS stream ended')
        
        const endData = {
          status: 'ok',
          text: '',
          final: true,
          debug: { message: 'Stream ended' }
        }
        history.push(endData)
        events.emit('data', endData)
        
        close()
      })

      // Send initial configuration
      streamCall.write({
        streamingConfig: streamingConfig
      })

      const openData = {
        status: 'ok',
        text: '',
        final: false,
        debug: { message: 'Stream opened' }
      }
      history.push(openData)
      events.emit('data', openData)

    } catch (err) {
      debug(`Error opening Google TTS stream: ${err.message}`)
      throw new Error(`Google Cloud TTS streaming failed: ${err.message}`)
    }

    // Return stream interface compatible with routes.js
    return {
      events,
      write,
      end,
      close,
      triggerHistoryEmit
    }
  }
}

module.exports = GoogleTTS
