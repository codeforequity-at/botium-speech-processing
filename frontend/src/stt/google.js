const _ = require('lodash')
const { v1: uuidv1 } = require('uuid')
const speech = process.env.BOTIUM_SPEECH_GOOGLE_API_VERSION ? require('@google-cloud/speech')[process.env.BOTIUM_SPEECH_GOOGLE_API_VERSION] : require('@google-cloud/speech')
const storage = require('@google-cloud/storage')
const request = require('request-promise-native')
const cheerio = require('cheerio')
const debug = require('debug')('botium-speech-processing-google-stt')

const { googleOptions } = require('../utils')

const GOOGLE_STT_LANGUAGES_URL = 'https://cloud.google.com/speech-to-text/docs/languages'
const downloadLanguageCodes = async () => {
  debug(`Downloading language codes from ${GOOGLE_STT_LANGUAGES_URL}`)
  const htmlString = await request(GOOGLE_STT_LANGUAGES_URL)
  const $ = cheerio.load(htmlString)

  const languageCodes = []
  $('#lang-table-container table tbody tr').each(function () {
    const tds = $(this).find('td')
    const languageCode = $(tds[1]).text().trim()
    if (languageCode) {
      languageCodes.push(languageCode)
    }
  })
  return languageCodes
}

let languageCodes = null

class GoogleSTT {
  async languages () {
    if (!languageCodes) {
      languageCodes = _.uniq(await downloadLanguageCodes()).sort()
    }
    return languageCodes
  }

  async stt ({ language, buffer }) {
    const speechClient = new speech.SpeechClient(googleOptions())
    const storageClient = new storage.Storage(googleOptions())

    const request = {
      config: {
        languageCode: language
      },
      audio: {
      }
    }
    if (process.env.BOTIUM_SPEECH_GOOGLE_CONFIG) {
      try {
        const defaultConfig = JSON.parse(process.env.BOTIUM_SPEECH_GOOGLE_CONFIG)
        Object.assign(request.config, defaultConfig)
      } catch (err) {
        throw new Error(`Google Speech config in BOTIUM_SPEECH_GOOGLE_CONFIG invalid: ${err.message}`)
      }
    }

    const gcsFileName = `${uuidv1()}.wav`
    if (process.env.BOTIUM_SPEECH_GOOGLE_BUCKET_NAME) {
      try {
        const bucket = storageClient.bucket(process.env.BOTIUM_SPEECH_GOOGLE_BUCKET_NAME)
        const file = bucket.file(gcsFileName)

        const stream = file.createWriteStream({
          metadata: {
            contentType: 'audio/wav'
          }
        })
        await (new Promise((resolve, reject) => {
          stream.on('error', (err) => {
            reject(err)
          })
          stream.on('finish', () => {
            resolve()
          })
          stream.end(buffer)
        }))
        request.audio.uri = `gs://${process.env.BOTIUM_SPEECH_GOOGLE_BUCKET_NAME}/${gcsFileName}`
        debug(`Google Cloud uploaded file to storage: ${request.audio.uri}`)
      } catch (err) {
        debug(err)
        throw new Error(`Google Cloud Upload failed: ${err.message}`)
      }
    } else {
      request.audio.content = buffer.toString('base64')
    }

    try {
      const [operation, initialApiResponse] = await speechClient.longRunningRecognize(request)
      debug(`Google Cloud initialApiResponse: ${JSON.stringify(initialApiResponse, null, 2)}`)
      // eslint-disable-next-line no-unused-vars
      const [response, metadata, finalApiResponse] = await operation.promise()
      debug(`Google Cloud response: ${JSON.stringify(response, null, 2)}`)
      const transcription = response.results.map(result => result.alternatives[0].transcript).join('\n')
      return {
        text: transcription,
        debug: response
      }
    } catch (err) {
      debug(err)
      throw new Error(`Google Cloud STT failed: ${err.message}`)
    } finally {
      if (process.env.BOTIUM_SPEECH_GOOGLE_BUCKET_NAME) {
        const bucket = storageClient.bucket(process.env.BOTIUM_SPEECH_GOOGLE_BUCKET_NAME)
        const file = bucket.file(gcsFileName)
        try {
          await file.delete()
          debug(`Google Cloud deleted file: ${gcsFileName}`)
        } catch (err) {
          console.log(`Google Cloud cleanup failed for file ${gcsFileName}, please remove manually`)
          debug(err)
        }
      }
    }
  }
}

module.exports = GoogleSTT
