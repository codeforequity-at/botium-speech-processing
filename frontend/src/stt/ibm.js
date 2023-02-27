const _ = require('lodash')
const SpeechToTextV1 = require('ibm-watson/speech-to-text/v1')
const debug = require('debug')('botium-speech-processing-ibm-stt')
const { PassThrough } = require('stream')
const EventEmitter = require('events')

const { ibmSttOptions } = require('../utils')

class IbmSTT {
  async languages (req) {
    const speechToText = new SpeechToTextV1(ibmSttOptions(req))

    const speechModels = await speechToText.listModels()
    return _.uniq(speechModels.result.models.map(m => m.language)).sort()
  }

  async stt_OpenStream (req, { language }) {
    const speechToText = new SpeechToTextV1(ibmSttOptions(req))

    const recognizeParams = {
      objectMode: true,
      contentType: 'audio/wav',
      model: language,
      interimResults: true,
      timestamps: true
    }
    if (recognizeParams.model.length === 5) {
      recognizeParams.model = `${recognizeParams.model}_BroadbandModel`
    }
    if (req.body && req.body.ibm && req.body.ibm.config) {
      Object.assign(recognizeParams, req.body.ibm.config)
    }

    let recognizeStream = null
    try {
      recognizeStream = speechToText.recognizeUsingWebSocket(recognizeParams)
    } catch (err) {
      debug(err)
      throw new Error(`IBM STT streaming failed: ${err.message}`)
    }

    const bufferStream = new PassThrough()
    bufferStream.pipe(recognizeStream)
    const events = new EventEmitter()
    const eventHistory = []

    recognizeStream.on('data', (data) => {
      for (const result of data.results || []) {
        const transcription = result.alternatives[0] ? result.alternatives[0].transcript : null
        if (transcription) {
          const event = {
            status: 'ok',
            text: transcription,
            final: !!result.final,
            debug: result
          }
          if (result.alternatives[0].timestamps && result.alternatives[0].timestamps.length > 0) {
            event.start = _.round(result.alternatives[0].timestamps[0][1], 3)
            event.end = _.round(result.alternatives[result.alternatives.length - 1].timestamps[0][2], 3)
          }
          events.emit('data', event)
          eventHistory.push(event)
        }
      }
    })
    recognizeStream.on('error', (err) => {
      const event = {
        status: 'error',
        err: `IBM STT failed: ${err.message}`
      }
      events.emit('data', event)
      eventHistory.push(event)
    })
    recognizeStream.on('close', () => {
      events.emit('close')
    })

    return {
      events,
      write: (buffer) => {
        bufferStream.push(buffer)
      },
      end: () => {
        if (recognizeStream) {
          recognizeStream.end()
        }
      },
      close: () => {
        if (recognizeStream) {
          recognizeStream.end()
          recognizeStream.destroy()
        }
        recognizeStream = null
      },
      triggerHistoryEmit: () => {
        for (const eh of eventHistory) {
          events.emit('data', eh)
        }
      }
    }
  }

  async stt (req, { language, buffer }) {
    const speechToText = new SpeechToTextV1(ibmSttOptions(req))

    const recognizeParams = {
      audio: buffer,
      contentType: 'audio/wav',
      model: language
    }
    if (recognizeParams.model.length === 5) {
      recognizeParams.model = `${recognizeParams.model}_BroadbandModel`
    }

    if (process.env.BOTIUM_SPEECH_IBM_STT_RECOGNIZE_CONFIG) {
      try {
        const defaultConfig = JSON.parse(process.env.BOTIUM_SPEECH_IBM_STT_RECOGNIZE_CONFIG)
        Object.assign(recognizeParams, defaultConfig)
      } catch (err) {
        throw new Error(`IBM STT config in BOTIUM_SPEECH_IBM_STT_RECOGNIZE_CONFIG invalid: ${err.message}`)
      }
    }
    if (req.body.ibm && req.body.ibm.config) {
      Object.assign(recognizeParams, req.body.ibm.config)
    }

    try {
      const speechRecognitionResults = await speechToText.recognize(recognizeParams)
      debug(`IBM STT response: ${JSON.stringify(speechRecognitionResults, null, 2)}`)
      const transcription = _.get(speechRecognitionResults, 'result.results[0].alternatives[0].transcript')
      return {
        text: transcription,
        debug: speechRecognitionResults
      }
    } catch (err) {
      debug(err)
      throw new Error(`IBM STT failed: ${err.message}`)
    }
  }
}

module.exports = IbmSTT
