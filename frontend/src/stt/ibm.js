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
      interimResults: true
    }
    if (recognizeParams.model.length === 5) {
      recognizeParams.model = `${recognizeParams.model}_BroadbandModel`
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

    recognizeStream.on('data', (data) => {
      const transcription = data.results[0] && data.results[0].alternatives[0] ? data.results[0].alternatives[0].transcript : null
      if (transcription) {
        events.emit('data', {
          transcription,
          final: data.results[0].final,
          debug: data
        })
      }
    })
    recognizeStream.on('error', (err) => {
      events.emit('data', {
        err: `${err.message}`
      })
    })
    recognizeStream.on('close', () => {
      events.emit('close')
    })

    return {
      events,
      write: (buffer) => {
        bufferStream.push(buffer)
      },
      close: () => {
        if (recognizeStream) {
          recognizeStream.end()
          recognizeStream.destroy()
        }
        recognizeStream = null
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
