const _ = require('lodash')
const request = require('request-promise-native')
const debug = require('debug')('botium-speech-processing-marytts')

let maryVoices = null

class MaryTTS {
  async voices () {
    if (maryVoices) return maryVoices

    const requestOptions = {
      method: 'GET',
      uri: `${process.env.BOTIUM_SPEECH_MARYTTS_URL}/voices`
    }
    let response
    try {
      response = await request(requestOptions)
    } catch (err) {
      throw new Error(`Calling url ${requestOptions.uri} failed: ${err.message}`)
    }
    if (_.isString(response)) {
      maryVoices = []
      const lines = response.split('\n').map(l => l.trim()).filter(l => l)
      for (const line of lines) {
        const parts = line.split(' ')
        maryVoices.push({
          name: parts[0],
          language: parts[1],
          gender: parts[2]
        })
      }
    }
    return maryVoices
  }

  async tts ({ language, voice, text }) {
    const voicesList = await this.voices()

    const maryVoice = voicesList.find(v => {
      if (language && v.language !== language) return false
      if (voice && v.name !== voice) return false
      return true
    })
    if (!maryVoice) throw new Error(`Voice <${voice || 'default'}> for language <${language}> not available`)

    const maryUrl = `${process.env.BOTIUM_SPEECH_MARYTTS_URL}/process?INPUT_TEXT=${encodeURIComponent(text)}&INPUT_TYPE=TEXT&OUTPUT_TYPE=AUDIO&AUDIO=WAVE_FILE&VOICE=${encodeURIComponent(maryVoice.name)}&LOCALE=${encodeURIComponent(maryVoice.language)}`

    const requestOptions = {
      method: 'GET',
      uri: maryUrl,
      encoding: null,
      resolveWithFullResponse: true,
      simple: false
    }
    let response
    try {
      response = await request(requestOptions)
    } catch (err) {
      throw new Error(`Calling url ${requestOptions.uri} failed: ${err.message}`)
    }
    if (response.statusCode === 200) {
      debug(`Called url ${requestOptions.uri} success`)
      return {
        buffer: response.body,
        name: 'tts.wav'
      }
    } else {
      throw new Error(`Calling url ${requestOptions.uri} failed with code ${response.statusCode}: ${response.statusMessage}`)
    }
  }
}

module.exports = MaryTTS
