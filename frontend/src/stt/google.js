const _ = require('lodash')
const { v1: uuidv1 } = require('uuid')
const speech = process.env.BOTIUM_SPEECH_GOOGLE_API_VERSION ? require('@google-cloud/speech')[process.env.BOTIUM_SPEECH_GOOGLE_API_VERSION] : require('@google-cloud/speech')
const storage = require('@google-cloud/storage')
const request = require('request-promise-native')
const cheerio = require('cheerio')
const { PassThrough } = require('stream')
const EventEmitter = require('events')

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
  async languages (req) {
    if (!languageCodes) {
      languageCodes = _.uniq(await downloadLanguageCodes()).sort()
    }
    return languageCodes
  }

  async stt_OpenStream (req, { language }) {
    const speechClient = new speech.SpeechClient(googleOptions(req))

    const request = {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: language
      },
      interimResults: false
    }
    if (process.env.BOTIUM_SPEECH_GOOGLE_CONFIG) {
      try {
        const defaultConfig = JSON.parse(process.env.BOTIUM_SPEECH_GOOGLE_CONFIG)
        Object.assign(request.config, defaultConfig)
      } catch (err) {
        throw new Error(`Google Speech config in BOTIUM_SPEECH_GOOGLE_CONFIG invalid: ${err.message}`)
      }
    }
    if (req.body.google && req.body.google.config) {
      Object.assign(request.config, req.body.google.config)
    }

    let recognizeStream = null
    try {
      recognizeStream = speechClient.streamingRecognize(request)
    } catch (err) {
      debug(err)
      throw new Error(`Google Cloud STT streaming failed: ${err.message}`)
    }

    const bufferStream = new PassThrough()
    bufferStream.pipe(recognizeStream)
    const events = new EventEmitter()

    recognizeStream.on('data', (data) => {
      const transcription = data.results[0] && data.results[0].alternatives[0] ? data.results[0].alternatives[0].transcript : null
      if (transcription) {
        events.emit('data', {
          text: transcription,
          final: !!data.results[0].isFinal,
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
      end: () => {
        if (recognizeStream) {
          recognizeStream.end()
        }
      },
      close: () => {
        if (recognizeStream) {
          recognizeStream.destroy()
        }
        recognizeStream = null
      }
    }
  }

  async stt (req, { language, buffer }) {
    const speechClient = new speech.SpeechClient(googleOptions(req))
    const storageClient = new storage.Storage(googleOptions(req))

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
    if (req.body.google && req.body.google.config) {
      Object.assign(request.config, req.body.google.config)
    }

    const gcsFileName = `${uuidv1()}.wav`
    const googleBucketName = (req.body.google && req.body.google.bucketName) || process.env.BOTIUM_SPEECH_GOOGLE_BUCKET_NAME

    if (googleBucketName) {
      try {
        const bucket = storageClient.bucket(googleBucketName)
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
        request.audio.uri = `gs://${googleBucketName}/${gcsFileName}`
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
      if (googleBucketName) {
        const bucket = storageClient.bucket(googleBucketName)
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
