const _ = require('lodash')
const axios = require('axios').default
const { SpeechSynthesisOutputFormat, SpeechSynthesizer } = require('microsoft-cognitiveservices-speech-sdk')
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
}

module.exports = AzureTTS
