const _ = require('lodash')
const axios = require('axios').default
const { SpeechSynthesisOutputFormat, SpeechSynthesizer, SpeechSynthesisResult, ResultReason } = require('microsoft-cognitiveservices-speech-sdk')
const { EventEmitter } = require('events')
const debug = require('debug')('botium-speech-processing-azure-tts')

const { azureSpeechConfig, applyExtraAzureSpeechConfig, getAzureErrorDetails, ttsFilename } = require('../utils')

const genderMap = {
  Male: 'male',
  Female: 'female'
}

class AzureTTS {
  async voices (req) {
    const speechConfig = azureSpeechConfig(req)

    const { data } = await axios({
      url: `https://${speechConfig.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': speechConfig.subscriptionKey
      }
    })
    const azureVoices = []
    data.forEach(voice => {
      azureVoices.push({
        name: voice.ShortName,
        gender: genderMap[voice.Gender],
        language: voice.Locale
      })
    })
    return azureVoices
  }

  async languages (req) {
    const voicesList = await this.voices(req)
    return _.uniq(voicesList.map(v => v.language)).sort()
  }

  async tts (req, { language, voice, text }) {
    const speechConfig = azureSpeechConfig(req)
    speechConfig.speechSynthesisOutputFormat = SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm

    if (language) speechConfig.speechSynthesisLanguage = language
    if (voice) speechConfig.speechSynthesisVoiceName = voice

    applyExtraAzureSpeechConfig(speechConfig, req)

    return new Promise((resolve, reject) => {
      const synthesizer = new SpeechSynthesizer(speechConfig)
      synthesizer.speakTextAsync(text,
        result => {
          const { audioData, errorDetails } = result
          if (errorDetails) {
            reject(new Error(`Azure TTS failed: ${getAzureErrorDetails(result)}`))
          } else if (audioData) {
            resolve({
              buffer: Buffer.from(result.audioData),
              name: `${ttsFilename(text)}.wav`
            })
          }
          synthesizer.close()
        },
        error => {
          debug(error)
          synthesizer.close()
          reject(new Error(`Azure TTS failed: ${error}`))
        })
    })
  }

  async tts_OpenStream (req, { language, voice }) {
    const speechConfig = azureSpeechConfig(req)
    speechConfig.speechSynthesisOutputFormat = SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm

    if (language) speechConfig.speechSynthesisLanguage = language
    if (voice) speechConfig.speechSynthesisVoiceName = voice

    applyExtraAzureSpeechConfig(speechConfig, req)

    const events = new EventEmitter()
    const history = []
    let isStreamClosed = false
    let synthesizer = null
    let textBuffer = ''

    const triggerHistoryEmit = () => {
      history.forEach(data => events.emit('data', data))
    }

    const write = (textChunk) => {
      if (isStreamClosed) return
      
      debug(`Receiving text chunk for Azure TTS: ${textChunk}`)
      textBuffer += textChunk
      
      // Process text in chunks for streaming synthesis
      processTextBuffer()
    }

    const processTextBuffer = () => {
      if (isStreamClosed || !textBuffer.trim()) return
      
      // Look for sentence endings to create natural breaks
      const sentences = textBuffer.match(/[^.!?]+[.!?]+/g)
      
      if (sentences && sentences.length > 0) {
        sentences.forEach(sentence => {
          if (isStreamClosed) return
          
          debug(`Synthesizing sentence: ${sentence.trim()}`)
          synthesizeSentence(sentence.trim())
        })
        
        // Keep remaining text that doesn't end with punctuation
        const remainingText = textBuffer.replace(/[^.!?]+[.!?]+/g, '').trim()
        textBuffer = remainingText
      }
    }

    const synthesizeSentence = (text) => {
      if (isStreamClosed || !synthesizer || !text.trim()) return
      
      try {
        synthesizer.speakTextAsync(text,
          result => {
            if (isStreamClosed) return
            
            debug(`Azure TTS result for sentence: ${text.substring(0, 50)}...`)
            
            if (result.reason === ResultReason.SynthesizingAudioCompleted) {
              const audioData = {
                status: 'ok',
                buffer: Buffer.from(result.audioData),
                final: false,
                debug: { 
                  audioLength: result.audioData.byteLength,
                  sentence: text.substring(0, 100) + (text.length > 100 ? '...' : '')
                }
              }
              history.push(audioData)
              events.emit('data', audioData)
            } else if (result.reason === ResultReason.Canceled) {
              const errorData = {
                status: 'error',
                text: '',
                final: true,
                err: getAzureErrorDetails(result)
              }
              history.push(errorData)
              events.emit('data', errorData)
            }
          },
          error => {
            if (isStreamClosed) return
            
            debug(`Azure TTS error for sentence: ${error}`)
            const errorData = {
              status: 'error',
              text: '',
              final: true,
              err: error
            }
            history.push(errorData)
            events.emit('data', errorData)
          }
        )
      } catch (err) {
        debug(`Error in synthesizeSentence: ${err.message}`)
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
      if (isStreamClosed) return
      
      debug('Ending Azure TTS stream')
      
      // Process any remaining text in buffer
      if (textBuffer.trim()) {
        synthesizeSentence(textBuffer.trim())
        textBuffer = ''
      }
      
      // Signal end of stream
      setTimeout(() => {
        if (!isStreamClosed) {
          const endData = {
            status: 'ok',
            text: '',
            final: true,
            debug: { message: 'Stream ended' }
          }
          history.push(endData)
          events.emit('data', endData)
          close()
        }
      }, 500) // Give time for final synthesis to complete
    }

    const close = () => {
      if (isStreamClosed) return
      
      isStreamClosed = true
      debug('Closing Azure TTS stream')
      
      if (synthesizer) {
        try {
          synthesizer.close()
        } catch (err) {
          debug(`Error closing synthesizer: ${err.message}`)
        }
        synthesizer = null
      }
      
      events.emit('close')
    }

    try {
      debug(`Opening Azure TTS streaming synthesis with voice: ${voice || 'default'}`)
      
      synthesizer = new SpeechSynthesizer(speechConfig)
      
      // Setup synthesizer event handlers for streaming
      synthesizer.synthesisStarted = (sender, event) => {
        debug('Azure TTS synthesis started')
        const startData = {
          status: 'ok',
          text: '',
          final: false,
          debug: { message: 'Synthesis started', sessionId: event.sessionId }
        }
        history.push(startData)
        events.emit('data', startData)
      }

      synthesizer.synthesizing = (sender, event) => {
        debug(`Azure TTS synthesizing: ${event.result.audioData.byteLength} bytes`)
        
        if (event.result.audioData.byteLength > 0) {
          const audioData = {
            status: 'ok',
            buffer: Buffer.from(event.result.audioData),
            final: false,
            debug: { 
              audioLength: event.result.audioData.byteLength,
              partial: true
            }
          }
          history.push(audioData)
          events.emit('data', audioData)
        }
      }

      synthesizer.synthesisCompleted = (sender, event) => {
        debug('Azure TTS synthesis completed for chunk')
        
        const completeData = {
          status: 'ok',
          text: '',
          final: false,
          debug: { 
            message: 'Chunk synthesis completed',
            resultId: event.result.resultId
          }
        }
        history.push(completeData)
        events.emit('data', completeData)
      }

      synthesizer.SynthesisCanceled = (sender, event) => {
        debug(`Azure TTS synthesis canceled: ${event.reason}`)
        
        const cancelData = {
          status: 'error',
          text: '',
          final: true,
          err: `Synthesis canceled: ${event.reason}`
        }
        history.push(cancelData)
        events.emit('data', cancelData)
      }

      const openData = {
        status: 'ok',
        text: '',
        final: false,
        debug: { message: 'Stream opened' }
      }
      history.push(openData)
      events.emit('data', openData)

    } catch (err) {
      debug(`Error opening Azure TTS stream: ${err.message}`)
      throw new Error(`Azure TTS streaming failed: ${err.message}`)
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

module.exports = AzureTTS
