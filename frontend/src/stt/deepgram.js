const _ = require('lodash')
const { createClient } = require('@deepgram/sdk')
const { PassThrough } = require('stream')
const EventEmitter = require('events')
const debug = require('debug')('botium-speech-processing-deepgram-stt')

const { deepgramOptions } = require('../utils')

class DeepgramSTT {
  async languages (req) {
    // Deepgram supports a wide range of languages
    // This is a subset of commonly used languages
    return [
      'da', 'de', 'en', 'en-AU', 'en-GB', 'en-IN', 'en-NZ', 'en-US',
      'es', 'es-419', 'fi', 'fr', 'fr-CA', 'hi', 'id', 'it', 'ja',
      'ko', 'nl', 'no', 'pl', 'pt', 'pt-BR', 'pt-PT', 'ru', 'sv',
      'ta', 'th', 'tr', 'uk', 'zh', 'zh-CN', 'zh-TW'
    ].sort()
  }

  async stt_OpenStream (req, { language }) {
    const options = deepgramOptions(req)
    if (!options.apiKey) {
      throw new Error('Deepgram API key not configured')
    }

    const deepgram = createClient(options.apiKey)
    
    const streamOptions = {
      model: 'general',
      language: language,
      smart_format: true,
      punctuate: true,
      interim_results: true,
      utterance_end_ms: 1000,
      vad_events: true
    }

    // Apply default config from environment
    if (process.env.BOTIUM_SPEECH_DEEPGRAM_CONFIG) {
      try {
        const defaultConfig = JSON.parse(process.env.BOTIUM_SPEECH_DEEPGRAM_CONFIG)
        Object.assign(streamOptions, defaultConfig)
      } catch (err) {
        throw new Error(`Deepgram config in BOTIUM_SPEECH_DEEPGRAM_CONFIG invalid: ${err.message}`)
      }
    }

    // Apply request-specific config
    if (req.body && req.body.deepgram && req.body.deepgram.config) {
      Object.assign(streamOptions, req.body.deepgram.config)
    }

    const events = new EventEmitter()
    let eventHistory = []
    let connection = null

    try {
      connection = deepgram.listen.live(streamOptions)
      
      connection.on('open', () => {
        debug('Deepgram WebSocket opened')
      })

      connection.on('Results', (data) => {
        console.log(data)
        const result = data.channel.alternatives[0]
        if (result && result.transcript) {
          const event = {
            status: 'ok',
            text: result.transcript,
            final: data.is_final || false,
            debug: data
          }
          
          // Add timing information if available
          if (data.start && data.duration) {
            event.start = _.round(data.start, 3)
            event.end = _.round(data.start + data.duration, 3)
          }
          
          events.emit('data', event)
          if (eventHistory) {
            eventHistory.push(event)
          }
        }
      })

      connection.on('UtteranceEnd', (data) => {
        debug('Deepgram utterance end detected')
      })

      connection.on('error', (err) => {
        const event = {
          status: 'error',
          err: `Deepgram STT failed: ${err.message || err}`
        }
        events.emit('data', event)
        if (eventHistory) {
          eventHistory.push(event)
        }
      })

      connection.on('close', () => {
        debug('Deepgram WebSocket closed')
        events.emit('close')
      })

    } catch (err) {
      debug(err)
      throw new Error(`Deepgram STT streaming setup failed: ${err.message}`)
    }

    return {
      events,
      write: (buffer) => {
        if (connection && connection.getReadyState() === 1) {
          connection.send(buffer)
        }
      },
      end: () => {
        if (connection) {
          connection.finish()
        }
      },
      close: () => {
        if (connection) {
          connection.finish()
          connection = null
        }
        eventHistory = null
      },
      triggerHistoryEmit: () => {
        for (const eh of eventHistory) {
          events.emit('data', eh)
        }
      }
    }
  }

  async stt (req, { language, buffer, hint }) {
    const options = deepgramOptions(req)
    if (!options.apiKey) {
      throw new Error('Deepgram API key not configured')
    }

    const deepgram = createClient(options.apiKey)
    
    const transcribeOptions = {
      model: 'general',
      language: language,
      smart_format: true,
      punctuate: true
    }

    // Add search terms if hint is provided
    if (hint && hint.length > 0) {
      transcribeOptions.search = [hint]
    }

    // Apply default config from environment
    if (process.env.BOTIUM_SPEECH_DEEPGRAM_CONFIG) {
      try {
        const defaultConfig = JSON.parse(process.env.BOTIUM_SPEECH_DEEPGRAM_CONFIG)
        Object.assign(transcribeOptions, defaultConfig)
      } catch (err) {
        throw new Error(`Deepgram config in BOTIUM_SPEECH_DEEPGRAM_CONFIG invalid: ${err.message}`)
      }
    }

    // Apply request-specific config
    if (req.body && req.body.deepgram && req.body.deepgram.config) {
      Object.assign(transcribeOptions, req.body.deepgram.config)
    }

    try {
      debug(`Calling Deepgram API with options: ${JSON.stringify(transcribeOptions)}`)
      
      const response = await deepgram.listen.prerecorded.transcribeFile(
        buffer,
        transcribeOptions
      )

      debug(`Deepgram response: ${JSON.stringify(response, null, 2)}`)

      if (response.results && response.results.channels && response.results.channels[0]) {
        const channel = response.results.channels[0]
        if (channel.alternatives && channel.alternatives[0]) {
          const transcript = channel.alternatives[0].transcript || ''
          return {
            text: transcript,
            debug: response
          }
        }
      }

      return {
        text: '',
        debug: response
      }
    } catch (err) {
      debug(err)
      throw new Error(`Deepgram STT failed: ${err.message || err}`)
    }
  }
}

module.exports = DeepgramSTT