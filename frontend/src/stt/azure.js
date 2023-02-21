const _ = require('lodash')
const request = require('request-promise-native')
const cheerio = require('cheerio')
const EventEmitter = require('events')
const { ResultReason, AudioInputStream, AudioStreamFormat, AudioConfig, SpeechRecognizer, PhraseListGrammar, OutputFormat } = require('microsoft-cognitiveservices-speech-sdk')
const debug = require('debug')('botium-speech-processing-azure')

const { azureSpeechConfig, applyExtraAzureSpeechConfig, getAzureErrorDetails } = require('../utils')

const AZURE_STT_LANGUAGES_URL = 'https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support'
const downloadLanguageCodes = async () => {
  debug(`Downloading language codes from ${AZURE_STT_LANGUAGES_URL}`)
  const htmlString = await request(AZURE_STT_LANGUAGES_URL)
  const $ = cheerio.load(htmlString)

  const languageCodes = []
  $('table:first-of-type tbody tr').each(function () {
    const tds = $(this).find('td')
    const languageCode = $(tds[1]).text().trim()
    if (languageCode) {
      languageCodes.push(languageCode)
    }
  })
  return languageCodes
}

let languageCodes = null

class AzureSTT {
  async languages (req) {
    if (!languageCodes) {
      languageCodes = _.uniq(await downloadLanguageCodes()).sort()
    }
    return languageCodes
  }

  async stt_OpenStream (req, { language }) {
    const speechConfig = azureSpeechConfig(req)

    speechConfig.outputFormat = OutputFormat.Detailed
    if (language) speechConfig.speechRecognitionLanguage = language

    applyExtraAzureSpeechConfig(speechConfig, req)

    let audioFormat = AudioStreamFormat.getDefaultInputFormat()
    const extraAzureFormatConfig = _.get(req, 'body.azure.config.audioStreamFormat')
    if (extraAzureFormatConfig) {
      audioFormat = AudioStreamFormat.getWaveFormatPCM(extraAzureFormatConfig.samplesPerSecond || 16000, extraAzureFormatConfig.bitsPerSample || 16, extraAzureFormatConfig.channels || 1)
    }
    const pushStream = AudioInputStream.createPushStream(audioFormat)
    const audioConfig = AudioConfig.fromStreamInput(pushStream)
    const recognizer = new SpeechRecognizer(speechConfig, audioConfig)

    const events = new EventEmitter()

    const recognizedHandler = (s, e) => {
      if (e.result.reason === ResultReason.RecognizedSpeech || e.result.reason === ResultReason.RecognizingSpeech) {
        const event = {
          status: 'ok',
          text: e.result.text,
          final: e.result.reason === ResultReason.RecognizedSpeech,
          debug: e.result
        }
        event.start = _.round(e.result.offset / 10000000, 3)
        event.end = _.round((e.result.offset + e.result.duration) / 10000000, 3)
        events.emit('data', event)
      }
    }
    recognizer.recognizing = recognizedHandler
    recognizer.recognized = recognizedHandler
    recognizer.sessionStopped = (s, e) => {
      // recognizer.stopContinuousRecognitionAsync()
      // events.emit('close')
    }
    recognizer.canceled = (s, e) => {
      console.log(e.errorDetails)
      setTimeout(() => {
        const event = {
          status: 'error',
          err: 'test'
        }
        events.emit('data', event)
      }, 0)
    }
    recognizer.startContinuousRecognitionAsync()

    return new Promise((resolve, reject) => {
      /* recognizer.canceled = (s, e) => {
        recognizer.stopContinuousRecognitionAsync()
        reject(new Error(`Azure STT failed: ${getAzureErrorDetails(e)}`))
      } */
      resolve({
        events,
        write: (buffer) => {
          pushStream.write(buffer)
        },
        end: () => {
        },
        close: () => {
          recognizer.stopContinuousRecognitionAsync()
          pushStream.close()
        }
      })
    })
  }

  async stt (req, { language, buffer, hint }) {
    const speechConfig = azureSpeechConfig(req)

    speechConfig.outputFormat = OutputFormat.Detailed
    if (language) speechConfig.speechRecognitionLanguage = language

    applyExtraAzureSpeechConfig(speechConfig, req)

    let audioFormat = AudioStreamFormat.getDefaultInputFormat()
    const extraAzureFormatConfig = _.get(req, 'body.azure.config.audioStreamFormat')
    if (extraAzureFormatConfig) {
      audioFormat = AudioStreamFormat.getWaveFormatPCM(extraAzureFormatConfig.samplesPerSecond || 16000, extraAzureFormatConfig.bitsPerSample || 16, extraAzureFormatConfig.channels || 1)
    }

    const pushStream = AudioInputStream.createPushStream(audioFormat)
    pushStream.write(buffer)
    pushStream.close()

    return new Promise((resolve, reject) => {
      const audioConfig = AudioConfig.fromStreamInput(pushStream)
      const recognizer = new SpeechRecognizer(speechConfig, audioConfig)

      if (hint && hint.length > 0) {
        const phraseList = PhraseListGrammar.fromRecognizer(recognizer)
        phraseList.addPhrase(hint)
      }

      recognizer.recognizeOnceAsync(
        result => {
          if (result.errorDetails) {
            reject(new Error(`Azure STT failed: ${getAzureErrorDetails(result)}`))
          } else {
            resolve({
              text: result.text || '',
              debug: result
            })
          }
          recognizer.close()
        },
        error => {
          debug(error)
          recognizer.close()
          reject(new Error(`Azure STT failed: ${error}`))
        })
    })
  }
}

module.exports = AzureSTT
