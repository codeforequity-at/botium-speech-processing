const util = require('util')
const _ = require('lodash')
const Mustache = require('mustache')
const request = require('request-promise-native')
const debug = require('debug')('botium-speech-processing-kaldi')

class KaldiSTT {
  async languages (req) {
    const envKeys = Object.keys(process.env).filter(k => k.startsWith('BOTIUM_SPEECH_KALDI_URL_'))
    return _.uniq(envKeys.map(k => k.split('_')[4].toLowerCase())).sort()
  }

  async stt (req, { language, buffer }) {
    const envVarUrl = `BOTIUM_SPEECH_KALDI_URL_${language.toUpperCase()}`
    if (!process.env[envVarUrl]) throw new Error(`Environment variable ${envVarUrl} empty`)

    const requestOptions = {
      method: 'PUT',
      uri: Mustache.render(process.env[envVarUrl], { language }),
      body: buffer,
      resolveWithFullResponse: true,
      simple: false
    }

    let response
    try {
      debug(`Calling kaldi url ${requestOptions.uri} ...`)
      response = await request(requestOptions)
    } catch (err) {
      throw new Error(`Calling url ${requestOptions.uri} failed: ${err.message}`)
    }
    if (response.statusCode === 200) {
      const body = JSON.parse(response.body)
      debug(`Called url ${requestOptions.uri} success: ${util.inspect(body)}`)
      if (body.status === 0) {
        if (body.hypotheses && body.hypotheses[0].utterance) {
          return {
            text: body.hypotheses[0].utterance,
            debug: body
          }
        } else {
          return {
            text: '',
            debug: body
          }
        }
      } else {
        throw new Error(`Kaldi failed with code ${body.status}: ${body.message}`)
      }
    } else {
      throw new Error(`Calling url ${requestOptions.uri} failed with code ${response.statusCode}: ${response.statusMessage}`)
    }
  }
}

module.exports = KaldiSTT
