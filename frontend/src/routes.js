const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const crypto = require('crypto')
const { v1: uuidv1 } = require('uuid')
const _ = require('lodash')
const express = require('express')
const multer = require('multer')
const sanitize = require('sanitize-filename')
const contentDisposition = require('content-disposition')
const { WebSocketServer } = require('ws')
const { runconvert } = require('./convert/convert')
const { wer, readBaseUrls } = require('./utils')
const { getAudioLengthSeconds } = require('./soxi')
const debug = require('debug')('botium-speech-processing-routes')

const cachePathStt = (process.env.BOTIUM_SPEECH_CACHE_DIR && path.join(process.env.BOTIUM_SPEECH_CACHE_DIR, 'stt')) || './resources/.cache/stt'
const cachePathTts = (process.env.BOTIUM_SPEECH_CACHE_DIR && path.join(process.env.BOTIUM_SPEECH_CACHE_DIR, 'tts')) || './resources/.cache/tts'
const tmpPath = process.env.BOTIUM_SPEECH_TMP_DIR || './resources/.tmp'
const cacheKeyStt = (body, data, language, ext) => sanitize(`${body ? crypto.createHash('md5').update(JSON.stringify(body)).digest('hex') + '_' : ''}${crypto.createHash('md5').update(data).digest('hex')}_${language}${ext}`)
const cacheKeyTts = (body, data, language, voice, ext) => sanitize(`${body ? crypto.createHash('md5').update(JSON.stringify(body)).digest('hex') + '_' : ''}${crypto.createHash('md5').update(data).digest('hex')}_${language}_${voice || 'default'}${ext}`)

if (process.env.BOTIUM_SPEECH_CACHE_DIR === undefined) {
  console.log(`ATTENTION: cache dir is not set, using ${cachePathStt} and ${cachePathTts} instead`)
}

if (process.env.BOTIUM_SPEECH_TMP_DIR === undefined) {
  console.log(`ATTENTION: tmp dir is not set, using ${tmpPath} instead`)
}

if (cachePathStt) mkdirp.sync(cachePathStt)
if (cachePathTts) mkdirp.sync(cachePathTts)

if (tmpPath) {
  mkdirp.sync(tmpPath)
}

const ttsEngines = {
  google: new (require('./tts/google'))(),
  ibm: new (require('./tts/ibm'))(),
  azure: new (require('./tts/azure'))(),
  polly: new (require('./tts/polly'))(),
  marytts: new (require('./tts/marytts'))(),
  picotts: new (require('./tts/picotts'))()
}
const sttEngines = {
  google: new (require('./stt/google'))(),
  kaldi: new (require('./stt/kaldi'))(),
  ibm: new (require('./stt/ibm'))(),
  azure: new (require('./stt/azure'))(),
  awstranscribe: new (require('./stt/awstranscribe'))()
}

const multerMemoryStorage = multer.memoryStorage()
const extractMultipartContent = (req, res) => new Promise((resolve, reject) => {
  multer({ storage: multerMemoryStorage }).single('content')(req, res, (err) => {
    if (req.body) {
      for (const key of Object.keys(req.body)) {
        if (_.isString(req.body[key])) {
          try {
            req.body[key] = JSON.parse(req.body[key])
          } catch (err) {
          }
        }
      }
    }
    if (err instanceof multer.MulterError) {
      resolve(null)
    } else if (err) {
      reject(err)
    } else if (req.file && req.file.buffer) {
      resolve(req.file.buffer)
    } else {
      resolve(null)
    }
  })
})

const _addContentDurationHeadersForFile = async (name, filenameOrBuffer, headers = {}) => {
  try {
    const outputDuration = await getAudioLengthSeconds(filenameOrBuffer)
    return _addContentDurationHeaders(outputDuration, headers)
  } catch (err) {
    debug(`no audio length readable for ${name}: ${err.message}`)
    return headers
  }
}

const _addContentDurationHeaders = (outputDuration, headers = {}) => {
  if (outputDuration >= 0) {
    headers['Content-Duration'] = outputDuration.toFixed(0)
    headers['X-Content-Duration'] = outputDuration.toFixed(3)
  }
  return headers
}

const router = express.Router()

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     ApiKeyAuth:
 *       type: apiKey
 *       in: header
 *       name: BOTIUM_API_TOKEN
 */

/**
 * @swagger
 * /api/status:
 *   get:
 *     description: Returns Botium Speech Processing Status
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - application/json
 *     responses:
 *       200:
 *         description: Botium Speech Processing Status
 *         schema:
 *           properties:
 *             status:
 *               type: string
 *               enum: [OK, UNAVAILABLE]
 */
;[router.get.bind(router), router.post.bind(router)].forEach(m => m('/api/status', (req, res) => {
  res.json({ status: 'OK' })
}))

/**
 * @swagger
 * /api/sttlanguages:
 *   get:
 *     description: Get list of STT languages
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: stt
 *         description: Speech-to-text backend
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [kaldi, google, ibm, azure, awstranscribe]
 *     responses:
 *       200:
 *         description: List of supported STT languages
 *         schema:
 *           type: array
 *           items:
 *             type: string
 */
;[router.get.bind(router), router.post.bind(router)].forEach(m => m('/api/sttlanguages', async (req, res, next) => {
  try {
    const stt = sttEngines[(req.query.stt && sanitize(req.query.stt)) || process.env.BOTIUM_SPEECH_PROVIDER_STT]
    res.json(await stt.languages(req))
  } catch (err) {
    return next(err)
  }
}))

/**
 * @swagger
 * /api/stt/{language}:
 *   post:
 *     description: Convert audio file to text
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: language
 *         description: Language code (as returned from sttlanguages endpoint)
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: hint
 *         description: Hint text for the Speech-to-text backend (supported by google and azure)
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *       - name: wer
 *         description: Text for calculating the Levenshtein edit distance for the result text (word error rate)
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *       - name: stt
 *         description: Speech-to-text backend
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [kaldi, google, ibm, azure, awstranscribe]
 *       - name: cache
 *         description: Use result cache (default Y)
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [Y, N]
 *     requestBody:
 *       description: Audio file
 *       content:
 *         audio/wav:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Extracted text
 *         schema:
 *           properties:
 *             text:
 *               type: string
 */
router.post('/api/stt/:language', async (req, res, next) => {
  let buffer = null
  if (Buffer.isBuffer(req.body)) {
    buffer = req.body
  } else {
    buffer = await extractMultipartContent(req, res)
  }

  if (buffer) {
    const skipCache = req.query && req.query.cache === 'N'

    let cacheFile = null
    if (cachePathStt) {
      cacheFile = path.join(cachePathStt, cacheKeyStt(Buffer.isBuffer(req.body) ? null : req.body, buffer, req.params.language, '.json'))
      if (fs.existsSync(cacheFile)) {
        if (skipCache) {
          try {
            fs.unlinkSync(cacheFile)
          } catch (err) {
            debug(`Failed deleting stt result ${cacheFile} from cache: ${err.message}`)
          }
        } else {
          try {
            const result = JSON.parse(fs.readFileSync(cacheFile).toString())
            if (req.query.wer) {
              result.wer = await wer(req.query.wer, result.text)
            }
            debug(`Reading stt result ${cacheFile} from cache: ${result.text}`)
            return res.json(result).end()
          } catch (err) {
            debug(`Failed reading stt result ${cacheFile} from cache: ${err.message}`)
          }
        }
      }
    }
    try {
      const stt = sttEngines[(req.query.stt && sanitize(req.query.stt)) || process.env.BOTIUM_SPEECH_PROVIDER_STT]

      const result = await stt.stt(req, {
        language: req.params.language,
        buffer: buffer,
        hint: req.query.hint
      })
      if (req.query.wer) {
        result.wer = await wer(req.query.wer, result.text)
      }
      res.json(result).end()

      if (!skipCache && cachePathStt) {
        try {
          fs.writeFileSync(cacheFile, JSON.stringify(result))
          debug(`Writing stt result ${cacheFile} to cache: ${result.text}`)
        } catch (err) {
          debug(`Writing stt result ${cacheFile} to cache: ${result.text} - failed: ${err.message}`)
        }
      }
    } catch (err) {
      return next(err)
    }
  } else {
    next(new Error('req.body is not a buffer'))
  }
})

/**
 * @swagger
 * /api/ttsvoices:
 *   get:
 *     description: Get list of voices
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: tts
 *         description: Text-to-speech backend
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [google, ibm, azure, polly, marytts, picotts]
 *     responses:
 *       200:
 *         description: List of supported voices
 *         schema:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               language:
 *                 type: string
 *               gender:
 *                 type: [male, female, neutral]
 */
;[router.get.bind(router), router.post.bind(router)].forEach(m => m('/api/ttsvoices', async (req, res, next) => {
  try {
    const tts = ttsEngines[(req.query.tts && sanitize(req.query.tts)) || process.env.BOTIUM_SPEECH_PROVIDER_TTS]
    res.json(await tts.voices(req))
  } catch (err) {
    return next(err)
  }
}))

/**
 * @swagger
 * /api/ttslanguages:
 *   get:
 *     description: Get list of TTS languages
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: tts
 *         description: Text-to-speech backend
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [google, ibm, azure, polly, marytts, picotts]
 *     responses:
 *       200:
 *         description: List of supported TTS languages
 *         schema:
 *           type: array
 *           items:
 *             type: string
 */
;[router.get.bind(router), router.post.bind(router)].forEach(m => m('/api/ttslanguages', async (req, res, next) => {
  try {
    const tts = ttsEngines[(req.query.tts && sanitize(req.query.tts)) || process.env.BOTIUM_SPEECH_PROVIDER_TTS]
    res.json(await tts.languages(req))
  } catch (err) {
    return next(err)
  }
}))

/**
 * @swagger
 * /api/tts/{language}:
 *   get:
 *     description: Convert text file to audio
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - audio/wav
 *     parameters:
 *       - name: language
 *         description: Language code (as returned from ttslanguages endpoint)
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: text
 *         description: Text
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *       - name: voice
 *         description: Voice name
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *       - name: tts
 *         description: Text-to-speech backend
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [google, ibm, azure, polly, marytts, picotts]
 *       - name: cache
 *         description: Use result cache (default Y)
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [Y, N]
 *     responses:
 *       200:
 *         description: Audio file
 *         content:
 *           audio/wav:
 *             schema:
 *               type: string
 *               format: binary
 */
;[router.get.bind(router), router.post.bind(router)].forEach(m => m('/api/tts/:language', async (req, res, next) => {
  if (req.query.text) {
    const skipCache = req.query && req.query.cache === 'N'

    let cacheFileName = null
    let cacheFileBuffer = null
    if (cachePathTts) {
      cacheFileName = path.join(cachePathTts, cacheKeyTts(req.body, req.query.text, req.params.language, req.query.voice, '.txt'))
      cacheFileBuffer = path.join(cachePathTts, cacheKeyTts(req.body, req.query.text, req.params.language, req.query.voice, '.bin'))
      if (fs.existsSync(cacheFileName) && fs.existsSync(cacheFileBuffer)) {
        if (skipCache) {
          try {
            fs.unlinkSync(cacheFileName)
          } catch (err) {
            debug(`Failed deleting tts result ${cacheFileName} from cache: ${err.message}`)
          }
          try {
            fs.unlinkSync(cacheFileBuffer)
          } catch (err) {
            debug(`Failed deleting tts result ${cacheFileBuffer} from cache: ${err.message}`)
          }
        } else {
          try {
            const name = fs.readFileSync(cacheFileName).toString()
            const buffer = fs.readFileSync(cacheFileBuffer)
            debug(`Reading tts result ${cacheFileName} from cache: ${name}`)
            const headers = {
              'Content-disposition': `${contentDisposition(name)}`,
              'Content-Length': buffer.length
            }
            await _addContentDurationHeadersForFile(name, cacheFileBuffer, headers)
            res.writeHead(200, headers)
            return res.end(buffer)
          } catch (err) {
            debug(`Failed reading tts result ${cacheFileName} from cache: ${err.message}`)
          }
        }
      }
    }
    try {
      const tts = ttsEngines[(req.query.tts && sanitize(req.query.tts)) || process.env.BOTIUM_SPEECH_PROVIDER_TTS]

      const { buffer, name } = await tts.tts(req, {
        language: req.params.language,
        voice: req.query.voice,
        text: req.query.text
      })
      const headers = {
        'Content-disposition': `${contentDisposition(name)}`,
        'Content-Length': buffer.length
      }
      await _addContentDurationHeadersForFile(name, buffer, headers)
      res.writeHead(200, headers)
      res.end(buffer)

      if (!skipCache && cachePathTts) {
        try {
          fs.writeFileSync(cacheFileName, name)
          fs.writeFileSync(cacheFileBuffer, buffer)
          debug(`Writing tts result ${cacheFileName} to cache: ${name}`)
        } catch (err) {
          debug(`Writing tts result ${cacheFileName} to cache: ${name} - failed: ${err.message}`)
        }
      }
    } catch (err) {
      return next(err)
    }
  } else {
    next(new Error('req.query.text empty'))
  }
}))

/**
 * @swagger
 * /api/audio/info:
 *   post:
 *     description: Returns information about audio file
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       description: Audio file
 *       content:
 *         audio/wav:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Audio information
 *         content:
 *            application/json:
 *              schema:
 *                type: object
 */
router.post('/api/audio/info', async (req, res, next) => {
  let buffer = null
  if (Buffer.isBuffer(req.body)) {
    buffer = req.body
  } else {
    buffer = await extractMultipartContent(req, res)
  }

  if (!buffer) {
    return next(new Error('req.body is not a buffer'))
  }

  const duration = await getAudioLengthSeconds(buffer)

  try {
    res.json({
      duration
    })
  } catch (err) {
    return next(err)
  }
})

/**
 * @swagger
 * /api/convertprofiles:
 *   get:
 *     description: Get list of audio conversion profile
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - application/json
 *     responses:
 *       200:
 *         description: List of supported audio conversion profiles
 *         schema:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 */
;[router.get.bind(router), router.post.bind(router)].forEach(m => m('/api/convertprofiles', async (req, res, next) => {
  const keys = Object.keys(process.env).filter(e => e.startsWith('BOTIUM_SPEECH_CONVERT_PROFILE_') && e.endsWith('_CMD')).map(e => e.split('_')[4])
  return res.json(keys.map(key => ({
    name: key,
    description: process.env[`BOTIUM_SPEECH_CONVERT_PROFILE_${key}_DESC`] || ''
  })))
}))

/**
 * @swagger
 * /api/convert/{profile}:
 *   post:
 *     description: Convert audio file
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - audio/*
 *     parameters:
 *       - name: profile
 *         description: Conversion profile (for example WAVTOMONOWAV, MP3TOMONOWAV)
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: start
 *         description: Start Timecode within audio stream (01:32)
 *         in: query
 *         schema:
 *           type: string
 *           pattern: '^([0-5][0-9]):([0-5][0-9])$'
 *       - name: end
 *         description: End Timecode within audio stream (02:48)
 *         in: query
 *         schema:
 *           type: string
 *           pattern: '^([0-5][0-9]):([0-5][0-9])$'
 *     requestBody:
 *       description: Audio file
 *       content:
 *         audio/wav:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Audio file
 *         content:
 *           audio/*:
 *             schema:
 *               type: string
 *               format: binary
 */
router.post('/api/convert/:profile', async (req, res, next) => {
  let buffer = null
  if (Buffer.isBuffer(req.body)) {
    buffer = req.body
  } else {
    buffer = await extractMultipartContent(req, res)
  }

  if (!buffer) {
    return next(new Error('req.body is not a buffer'))
  }
  const envVarCmd = `BOTIUM_SPEECH_CONVERT_PROFILE_${req.params.profile.toUpperCase()}_CMD`
  if (!process.env[envVarCmd]) {
    return next(new Error(`Environment variable ${envVarCmd} empty`))
  }
  const envVarOutput = `BOTIUM_SPEECH_CONVERT_PROFILE_${req.params.profile.toUpperCase()}_OUTPUT`

  try {
    const { outputName, outputBuffer, outputDuration } = await runconvert(process.env[envVarCmd], process.env[envVarOutput], { inputBuffer: buffer, start: req.query.start, end: req.query.end })
    const headers = {
      'Content-disposition': `attachment; filename="${outputName}"`,
      'Content-Length': outputBuffer.length
    }
    _addContentDurationHeaders(outputDuration, headers)
    res.writeHead(200, headers)
    res.end(outputBuffer)
  } catch (err) {
    return next(err)
  }
})

/**
 * @swagger
 * /api/convert:
 *   post:
 *     description: Convert audio file in multiple steps
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - audio/*
 *     parameters:
 *       - name: profile
 *         description: Conversion profile (for example WAVTOMONOWAV, MP3TOMONOWAV)
 *         in: query
 *         required: true
 *         style: form
 *         explode: true
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - name: start
 *         description: Start Timecode within audio stream (01:32)
 *         in: query
 *         schema:
 *           type: string
 *           pattern: '^([0-5][0-9]):([0-5][0-9])$'
 *       - name: end
 *         description: End Timecode within audio stream (02:48)
 *         in: query
 *         schema:
 *           type: string
 *           pattern: '^([0-5][0-9]):([0-5][0-9])$'
 *     requestBody:
 *       description: Audio file
 *       content:
 *         audio/wav:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Audio file
 *         content:
 *           audio/*:
 *             schema:
 *               type: string
 *               format: binary
 */
router.post('/api/convert', async (req, res, next) => {
  let buffer = null
  if (Buffer.isBuffer(req.body)) {
    buffer = req.body
  } else {
    buffer = await extractMultipartContent(req, res)
  }

  if (!buffer) {
    return next(new Error('req.body is not a buffer'))
  }

  const profiles = _.isString(req.query.profile) ? [req.query.profile] : _.isArray(req.query.profile) ? req.query.profile : []
  let transformBuffer = buffer
  let transformName = null
  let transformDuration = null
  for (const profile of profiles) {
    const envVarCmd = `BOTIUM_SPEECH_CONVERT_PROFILE_${profile.toUpperCase()}_CMD`
    if (!process.env[envVarCmd]) {
      return next(new Error(`Environment variable ${envVarCmd} empty`))
    }
    const envVarOutput = `BOTIUM_SPEECH_CONVERT_PROFILE_${profile.toUpperCase()}_OUTPUT`

    try {
      const { outputName, outputBuffer, outputDuration } = await runconvert(process.env[envVarCmd], process.env[envVarOutput], { inputBuffer: transformBuffer, start: req.query.start, end: req.query.end })
      transformBuffer = outputBuffer
      transformName = outputName
      transformDuration = outputDuration
    } catch (err) {
      return next(err)
    }
  }
  const headers = {
    'Content-disposition': `attachment; filename="${transformName}"`,
    'Content-Length': transformBuffer.length
  }
  _addContentDurationHeaders(transformDuration, headers)
  res.writeHead(200, headers)
  res.end(transformBuffer)
})

/**
 * @swagger
 * /api/wer:
 *   get:
 *     description: Calculate Levenshtein edit distance between two strings (word error rate)
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: text1
 *         description: Text
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *       - name: text2
 *         description: Text
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Levenshtein Edit Distance on word level
 *         schema:
 *           properties:
 *             distance:
 *               type: integer
 *             wer:
 *               type: number
 */
;[router.get.bind(router), router.post.bind(router)].forEach(m => m('/api/wer', async (req, res) => {
  res.json(await wer(req.query.text1, req.query.text2))
}))

const wssStreams = {}

/**
 * @swagger
 * /api/sttstream/{language}:
 *   post:
 *     description: Open a Websocket stream vor converting audio stream to text
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: language
 *         description: Language code (as returned from sttlanguages endpoint)
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: stt
 *         description: Speech-to-text backend
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [kaldi, google, ibm, azure, awstranscribe]
 *     responses:
 *       200:
 *         description: Websocket Url to stream the audio to, and the uri to check status and end the stream
 *         schema:
 *           properties:
 *             wsUri:
 *               type: string
 *             statusUri:
 *               type: string
 *             endUri:
 *               type: string
 */
;[router.get.bind(router), router.post.bind(router)].forEach(m => m('/api/sttstream/:language', async (req, res, next) => {
  try {
    const stt = sttEngines[(req.query.stt && sanitize(req.query.stt)) || process.env.BOTIUM_SPEECH_PROVIDER_STT]

    const streamId = uuidv1()
    const stream = await stt.stt_OpenStream(req, { language: req.params.language })
    stream.events.on('close', () => delete wssStreams[streamId])
    stream.dateTimeStart = new Date()
    wssStreams[streamId] = stream

    const baseUrls = readBaseUrls(req)
    res.json({
      wsUri: `${baseUrls.wsUri}/${streamId}`,
      statusUri: `${baseUrls.baseUri}/api/sttstatus/${streamId}`,
      endUri: `${baseUrls.baseUri}/api/sttend/${streamId}`
    }).end()
  } catch (err) {
    return next(err)
  }
}))

/**
 * @swagger
 * /api/sttstatus/{streamId}:
 *   get:
 *     description: Check a Websocket stream for converting audio stream to text
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: streamId
 *         description: Stream Id (as returned from sttstream endpoint)
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Websocket stream ok
 *       404:
 *         description: Websocket stream not available
 */
;[router.get.bind(router), router.post.bind(router)].forEach(m => m('/api/sttstatus/:streamId', async (req, res, next) => {
  const stream = wssStreams[req.params.streamId]
  if (stream) {
    const streamDuration = ((new Date() - stream.dateTimeStart) / 1000).toFixed(3)
    res.status(200).json({ status: 'OK', streamId: req.params.streamId, streamDuration })
  } else {
    res.status(404).json({ status: 'NOTFOUND', streamId: req.params.streamId })
  }
}))

/**
 * @swagger
 * /api/sttend/{streamId}:
 *   get:
 *     description: Close a Websocket stream for converting audio stream to text
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: streamId
 *         description: Stream Id (as returned from sttstream endpoint)
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Websocket stream closed
 */
;[router.get.bind(router), router.post.bind(router)].forEach(m => m('/api/sttend/:streamId', async (req, res, next) => {
  const stream = wssStreams[req.params.streamId]
  if (stream) {
    try {
      stream.end()
    } catch (err) {
      return next(err)
    }
  }
  res.end()
}))

const wssUpgrade = (req, socket, head) => {
  const streamId = req.url.substring(req.url.lastIndexOf('/') + 1)
  const stream = wssStreams[streamId]
  if (!stream) throw new Error('not allowed')

  const wss1 = new WebSocketServer({ noServer: true })
  wss1.on('connection', async (ws) => {
    stream.events.on('data', (data) => {
      data.streamDuration = ((new Date() - stream.dateTimeStart) / 1000).toFixed(3)
      ws.send(JSON.stringify(data))
    })
    stream.events.on('close', () => {
      ws.close()
      wss1.close()
    })
    ws.on('message', (data) => {
      if (Buffer.isBuffer(data)) {
        stream.write(data)
      }
    })
    ws.on('close', () => {
      delete wssStreams[streamId]
      stream.close()
      wss1.close()
    })
  })
  wss1.handleUpgrade(req, socket, head, (ws) => {
    wss1.emit('connection', ws, req)
  })
}

module.exports = {
  skipSecurityCheck: (req) => (req.url.startsWith('/api/sttstatus/') || req.url.startsWith('/api/sttend/')),
  router,
  wssUpgrade
}
