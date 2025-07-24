const _ = require('lodash')
const { createClient } = require('@deepgram/sdk')
const axios = require('axios')
const WebSocket = require('ws')
const { EventEmitter } = require('events')
const debug = require('debug')('botium-speech-processing-deepgram-tts')

const { deepgramOptions, ttsFilename } = require('../utils')

class DeepgramTTS {
  async _fetchVoicesFromDocs() {
    try {
      // Fetch Deepgram TTS documentation page
      const response = await axios.get('https://developers.deepgram.com/docs/tts-models', {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      const html = response.data
      const voices = []
      
      // Parse voice models from documentation
      // Look for patterns like "aura-2-asteria-en" (only Aura-2 generation)
      const voicePattern = /aura-2-([a-z]+)-([a-z]{2,3})/g
      let match
      
      while ((match = voicePattern.exec(html)) !== null) {
        console.log(match)
        const fullMatch = match[0] // Full match like "aura-2-asteria-en"
        const name = fullMatch
        const voiceName = match[1] // asteria
        const language = match[2] // en
        
        // Determine gender based on common name patterns
        const femaleNames = ['asteria', 'luna', 'stella', 'athena', 'hera', 'esperanza', 'ramona', 'margot', 'claire', 'liesel', 'greta', 'lucia', 'sofia', 'valentina', 'giulia', 'hina', 'yuki', 'yuna', 'soo', 'xiaoxiao', 'mei', 'nova', 'emma', 'klara', 'katya', 'natasha', 'zeynep', 'maya', 'astrid', 'ingrid', 'maja', 'aino', 'oksana', 'tereza', 'zsofia', 'elena', 'maria', 'ana', 'milica', 'jana', 'meta', 'ausra', 'liga', 'kadri', 'sarah', 'layla', 'siriporn', 'linh', 'sari', 'siti', 'priya', 'rashida', 'fatima', 'maryam', 'amara']
        
        const gender = femaleNames.includes(voiceName) ? 'female' : 'male'
        
        voices.push({ name, gender, language })
      }
      
      // Remove duplicates
      const uniqueVoices = _.uniqBy(voices, 'name')
      
      // Filter out non-existent languages (keep only valid ISO codes)
      const validLanguages = [
        'ar', 'bg', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 
        'fa', 'fi', 'fr', 'he', 'hi', 'hr', 'hu', 'id', 'it', 'ja', 
        'ko', 'lt', 'lv', 'ms', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 
        'sk', 'sl', 'sr', 'sv', 'sw', 'ta', 'th', 'tr', 'uk', 'ur', 
        'vi', 'zh'
      ]
      
      const filteredVoices = uniqueVoices.filter(voice => 
        validLanguages.includes(voice.language)
      )
      
      debug(`Fetched ${filteredVoices.length} voices with valid languages from Deepgram documentation`)
      return filteredVoices.length > 0 ? filteredVoices : null
      
    } catch (err) {
      debug(`Failed to fetch voices from documentation: ${err.message}`)
      return null
    }
  }

  async voices (req) {
    // Try to fetch from documentation first
    const docVoices = await this._fetchVoicesFromDocs()
    if (docVoices && docVoices.length > 0) {
      return docVoices
    }
    
    // Fallback to static list if documentation parsing fails  
    debug('Using fallback static voice list (Aura-2 only)')
    return [
      // English voices (Aura-2)
      { name: 'aura-2-asteria-en', gender: 'female', language: 'en' },
      { name: 'aura-2-luna-en', gender: 'female', language: 'en' },
      { name: 'aura-2-stella-en', gender: 'female', language: 'en' },
      { name: 'aura-2-athena-en', gender: 'female', language: 'en' },
      { name: 'aura-2-hera-en', gender: 'female', language: 'en' },
      { name: 'aura-2-orion-en', gender: 'male', language: 'en' },
      { name: 'aura-2-arcas-en', gender: 'male', language: 'en' },
      { name: 'aura-2-perseus-en', gender: 'male', language: 'en' },
      { name: 'aura-2-angus-en', gender: 'male', language: 'en' },
      { name: 'aura-2-orpheus-en', gender: 'male', language: 'en' },
      { name: 'aura-2-helios-en', gender: 'male', language: 'en' },
      { name: 'aura-2-zeus-en', gender: 'male', language: 'en' }
    ]
  }

  async languages (req) {
    const voicesList = await this.voices(req)
    return _.uniq(voicesList.map(v => v.language)).sort()
  }

  async tts (req, { language, voice, text }) {
    const options = deepgramOptions(req)
    if (!options.apiKey) {
      throw new Error('Deepgram API key not configured')
    }

    const deepgram = createClient(options.apiKey)
    
    const speakOptions = {
      model: voice || 'aura-2-asteria-en',
      encoding: 'linear16',
      sample_rate: 16000
    }

    // Apply default config from environment
    if (process.env.BOTIUM_SPEECH_DEEPGRAM_TTS_CONFIG) {
      try {
        const defaultConfig = JSON.parse(process.env.BOTIUM_SPEECH_DEEPGRAM_TTS_CONFIG)
        Object.assign(speakOptions, defaultConfig)
      } catch (err) {
        throw new Error(`Deepgram TTS config in BOTIUM_SPEECH_DEEPGRAM_TTS_CONFIG invalid: ${err.message}`)
      }
    }

    // Apply request-specific config
    if (req.body && req.body.deepgram && req.body.deepgram.config) {
      Object.assign(speakOptions, req.body.deepgram.config)
    }

    try {
      debug(`Calling Deepgram TTS API with options: ${JSON.stringify(speakOptions)}`)
      
      const response = await deepgram.speak.request(
        { text },
        speakOptions
      )

      // Get the audio stream
      const stream = await response.getStream()
      if (!stream) {
        throw new Error('No audio stream received from Deepgram')
      }

      // Convert stream to buffer
      const chunks = []
      for await (const chunk of stream) {
        chunks.push(chunk)
      }
      const buffer = Buffer.concat(chunks)

      debug(`Deepgram TTS response received, buffer size: ${buffer.length}`)

      return {
        buffer: buffer,
        name: `${ttsFilename(text)}.wav`
      }
    } catch (err) {
      debug(err)
      throw new Error(`Deepgram TTS failed: ${err.message || err}`)
    }
  }

  async tts_OpenStream (req, { language, voice }) {
    const options = deepgramOptions(req)
    if (!options.apiKey) {
      throw new Error('Deepgram API key not configured')
    }

    const events = new EventEmitter()
    const history = []
    let isStreamClosed = false
    let ws = null

    const speakOptions = {
      model: voice || 'aura-2-asteria-en',
      encoding: 'linear16',
      sample_rate: 16000
    }

    // Apply default config from environment
    if (process.env.BOTIUM_SPEECH_DEEPGRAM_TTS_CONFIG) {
      try {
        const defaultConfig = JSON.parse(process.env.BOTIUM_SPEECH_DEEPGRAM_TTS_CONFIG)
        Object.assign(speakOptions, defaultConfig)
      } catch (err) {
        throw new Error(`Deepgram TTS config in BOTIUM_SPEECH_DEEPGRAM_TTS_CONFIG invalid: ${err.message}`)
      }
    }

    // Apply request-specific config  
    if (req.body && req.body.deepgram && req.body.deepgram.config) {
      Object.assign(speakOptions, req.body.deepgram.config)
    }

    const triggerHistoryEmit = () => {
      history.forEach(data => events.emit('data', data))
    }

    const write = (textChunk) => {
      if (isStreamClosed || !ws) return
      
      debug(`Sending text chunk to Deepgram: ${textChunk}`)
      
      try {
        ws.send(JSON.stringify({
          type: 'Speak',
          text: textChunk
        }))
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
      if (isStreamClosed || !ws) return
      
      debug('Closing Deepgram TTS stream')
      try {
        // Send flush to ensure all audio is processed
        ws.send(JSON.stringify({ type: 'Flush' }))
        
        // Close the WebSocket connection
        setTimeout(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close()
          }
        }, 100)
      } catch (err) {
        debug(`Error closing stream: ${err.message}`)
      }
    }

    const close = () => {
      if (isStreamClosed) return
      
      isStreamClosed = true
      debug('Force closing Deepgram TTS stream')
      
      if (ws) {
        try {
          ws.terminate()
        } catch (err) {
          debug(`Error terminating WebSocket: ${err.message}`)
        }
        ws = null
      }
      
      events.emit('close')
    }

    // Build WebSocket URL with authentication and options
    const wsUrl = new URL('wss://api.deepgram.com/v1/speak')
    wsUrl.searchParams.append('model', speakOptions.model)
    wsUrl.searchParams.append('encoding', speakOptions.encoding)
    wsUrl.searchParams.append('sample_rate', speakOptions.sample_rate.toString())
    
    // Add other speak options as query parameters
    Object.keys(speakOptions).forEach(key => {
      if (!['model', 'encoding', 'sample_rate'].includes(key)) {
        wsUrl.searchParams.append(key, speakOptions[key].toString())
      }
    })

    debug(`Connecting to Deepgram TTS WebSocket: ${wsUrl.toString().replace(options.apiKey, '[API_KEY]')}`)

    // Create WebSocket connection
    ws = new WebSocket(wsUrl.toString(), {
      headers: {
        'Authorization': `Token ${options.apiKey}`
      }
    })

    ws.on('open', () => {
      debug('Deepgram TTS WebSocket connected')
      
      const openData = {
        status: 'ok',
        text: '',
        final: false,
        debug: { message: 'Stream opened' }
      }
      history.push(openData)
      events.emit('data', openData)
    })

    ws.on('message', (data) => {
      try {
        // Check if message is binary audio data
        if (Buffer.isBuffer(data)) {
          debug(`Received audio data: ${data.length} bytes`)
          
          const audioData = {
            status: 'ok',
            buffer: data,
            final: false,
            debug: { audioLength: data.length }
          }
          history.push(audioData)
          events.emit('data', audioData)
        } else {
          // Parse JSON metadata messages
          const message = JSON.parse(data.toString())
          debug(`Received metadata: ${JSON.stringify(message)}`)
          
          const metaData = {
            status: 'ok',
            text: '',
            final: false,
            debug: message
          }
          history.push(metaData)
          events.emit('data', metaData)
        }
      } catch (err) {
        debug(`Error processing message: ${err.message}`)
        
        const errorData = {
          status: 'error',
          text: '',
          final: true,
          err: err.message
        }
        history.push(errorData)
        events.emit('data', errorData)
      }
    })

    ws.on('error', (err) => {
      debug(`Deepgram TTS WebSocket error: ${err.message}`)
      
      const errorData = {
        status: 'error',
        text: '',
        final: true,
        err: err.message
      }
      history.push(errorData)
      events.emit('data', errorData)
    })

    ws.on('close', (code, reason) => {
      debug(`Deepgram TTS WebSocket closed: ${code} ${reason}`)
      
      const closeData = {
        status: 'ok',
        text: '',
        final: true,
        debug: { closeCode: code, closeReason: reason.toString() }
      }
      history.push(closeData)
      events.emit('data', closeData)
      
      close()
    })

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

module.exports = DeepgramTTS