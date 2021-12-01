const _ = require('lodash')
const SpeechToTextV1 = require('ibm-watson/speech-to-text/v1')
const debug = require('debug')('botium-speech-processing-ibm-stt')

const { ibmSttOptions } = require('../utils')

class IbmSTT {
  async languages (req) {
    const speechToText = new SpeechToTextV1(ibmSttOptions(req))

    const speechModels = await speechToText.listModels()
    return _.uniq(speechModels.result.models.map(m => m.language)).sort()
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
