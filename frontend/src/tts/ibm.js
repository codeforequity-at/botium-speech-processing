const _ = require('lodash')
const TextToSpeechV1 = require('ibm-watson/text-to-speech/v1')
const debug = require('debug')('botium-speech-processing-ibm-tts')

const { ibmTtsOptions, ttsFilename } = require('../utils')

class IbmTTS {
  async voices (req) {
    const textToSpeech = new TextToSpeechV1(ibmTtsOptions(req))

    const voices = await textToSpeech.listVoices()

    const ibmVoices = []
    voices.result.voices.forEach(voice => {
      ibmVoices.push({
        name: voice.name,
        gender: voice.gender,
        language: voice.language
      })
    })
    return ibmVoices
  }

  async languages (req) {
    const voicesList = await this.voices(req)
    return _.uniq(voicesList.map(v => v.language)).sort()
  }

  async tts (req, { language, voice, text }) {
    const textToSpeech = new TextToSpeechV1(ibmTtsOptions(req))

    const synthesizeParams = {
      text: text,
      accept: 'audio/wav',
      voice: voice
    }

    try {
      const synthResult = await textToSpeech.synthesize(synthesizeParams)
      const buffer = await textToSpeech.repairWavHeaderStream(synthResult.result)
      return {
        buffer: buffer,
        name: `${ttsFilename(text)}.wav`
      }
    } catch (err) {
      debug(err)
      throw new Error(`IBM TTS failed: ${err.message}`)
    }
  }
}

module.exports = IbmTTS
