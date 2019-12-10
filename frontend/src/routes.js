const express = require('express')
const bodyParser = require('body-parser')
const debug = require('debug')('botium-speech-processing-routes')

const router = express.Router()

const tts = new (require(`./tts/${process.env.BOTIUM_SPEECH_PROVIDER_TTS}`))
const stt = new (require(`./stt/${process.env.BOTIUM_SPEECH_PROVIDER_STT}`))

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
router.get('/api/status', (req, res) => {
  res.json({ status: 'OK' })
})

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
 *         description: ISO-639-1 language code
 *         in: path
 *         required: true
 *         schema:
 *           type: string 
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
  if (Buffer.isBuffer(req.body)) {
    try {
      const { text } = await stt.stt({
        language: req.params.language,
        buffer: req.body
      })
      res.json({
        text
      }).end()
    } catch (err) {
      return next(err)
    }
  } else {
    next(new Error('req.body is not a buffer'))
  }
})

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
 *         description: ISO-639-1 language code
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
 *     responses:
 *       200:
 *         description: Audio file
 *         content:
 *           audio/wav:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/api/tts/:language', async (req, res, next) => {
  try {
    const { buffer, name } = await tts.tts({ 
      language: req.params.language,
      text: req.query.text
    })
    res.writeHead(200, {
      'Content-disposition': `attachment; filename="${name}"`,
      'Content-Length': buffer.length
    })
    res.end(buffer)
  } catch (err) {
    return next(err)
  }
})

module.exports = router
