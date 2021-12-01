const _ = require('lodash')
const textToSpeech = require('@google-cloud/text-to-speech')
const debug = require('debug')('botium-speech-processing-google-tts')

const { googleOptions, ttsFilename } = require('../utils')

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

    try {
      const [response] = await client.synthesizeSpeech(request)
      return {
        buffer: response.audioContent,
        name: `${ttsFilename(text)}.wav`
      }
    } catch (err) {
      debug(err)
      throw new Error(`Google Cloud STT failed: ${err.message}`)
    }
  }
}

module.exports = GoogleTTS
