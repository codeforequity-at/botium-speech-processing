const textToSpeech = require('@google-cloud/text-to-speech')
const debug = require('debug')('botium-speech-processing-google-tts')

const { googleOptions, ttsFilename } = require('../utils')

let googleVoices = null

const genderMap = {
  MALE: 'male',
  FEMALE: 'female',
  NEUTRAL: 'neutral'
}

class GoogleTTS {
  async voices () {
    if (googleVoices) return googleVoices

    const client = new textToSpeech.TextToSpeechClient(googleOptions())

    const [result] = await client.listVoices({})
    const voices = result.voices

    googleVoices = []
    voices.forEach(voice => {
      voice.languageCodes.forEach(languageCode => {
        googleVoices.push({
          name: voice.name,
          gender: genderMap[voice.ssmlGender],
          language: languageCode.split('-')[0]
        })
      })
    })
    return googleVoices
  }

  async tts ({ language, voice, text }) {
    const voiceSelector = {
      languageCode: language
    }
    if (voice) {
      voiceSelector.name = voice
    }

    const client = new textToSpeech.TextToSpeechClient(googleOptions())
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
