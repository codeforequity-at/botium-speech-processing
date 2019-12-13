const Mustache = require('mustache')
const request = require('request-promise-native')
const debug = require('debug')('botium-speech-processing-marytts')

class MaryTTS {
  build () {

  }

  async tts ({ language, text }) {
    const envVarUrl = `BOTIUM_SPEECH_MARYTTS_URL_${language.toUpperCase()}`
    if (!process.env[envVarUrl]) throw new Error(`Environment variable ${envVarUrl} empty`)

    const requestOptions = {
      method: 'GET',
      uri: Mustache.render(process.env[envVarUrl], {
        language: encodeURIComponent(language),
        text: encodeURIComponent(text)
      }),
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
