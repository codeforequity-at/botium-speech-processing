const _ = require('lodash')
const { TranscribeStreamingClient, StartStreamTranscriptionCommand } = require('@aws-sdk/client-transcribe-streaming')
const { PassThrough } = require('stream')
const EventEmitter = require('events')

const debug = require('debug')('botium-speech-processing-awstranscribe-stt')

const { awstranscribeOptions } = require('../utils')

const languageCodes = [
  'af-ZA',
  'ar-AE',
  'ar-SA',
  'zh-CN',
  'zh-TW',
  'da-DK',
  'nl-NL',
  'en-AU',
  'en-GB',
  'en-IN',
  'en-IE',
  'en-NZ',
  'en-AB',
  'en-ZA',
  'en-US',
  'en-WL',
  'fr-FR',
  'fr-CA',
  'fa-IR',
  'de-DE',
  'de-CH',
  'he-IL',
  'hi-IN',
  'id-ID',
  'it-IT',
  'ja-JP',
  'ko-KR',
  'ms-MY',
  'pt-PT',
  'pt-BR',
  'ru-RU',
  'es-ES',
  'es-US',
  'ta-IN',
  'te-IN',
  'th-TH',
  'tr-TR'
].sort()

class AwsTranscribeSTT {
  async languages (req) {
    return languageCodes
  }

  async stt_OpenStream (req, { language }) {
    const transcribeClient = new TranscribeStreamingClient(awstranscribeOptions(req))

    let audioInputStream = new PassThrough()
    const audioStream = async function * () {
      for await (const payloadChunk of audioInputStream) {
        const chunks = _.chunk(payloadChunk, 25000)
        for (const chunk of chunks) {
          yield { AudioEvent: { AudioChunk: Buffer.from(chunk) } }
        }
      }
    }

    const request = {
      LanguageCode: language,
      MediaEncoding: 'pcm',
      MediaSampleRateHertz: 16000,
      AudioStream: audioStream()
    }
    if (req.body && req.body.awstranscribe && req.body.awstranscribe.config) {
      Object.assign(request, req.body.awstranscribe.config)
    }

    const events = new EventEmitter()
    try {
      const cmdResponse = await transcribeClient.send(new StartStreamTranscriptionCommand(request))
      setTimeout(async () => {
        try {
          for await (const event of cmdResponse.TranscriptResultStream) {
            const results = _.get(event, 'TranscriptEvent.Transcript.Results')
            if (results && results.length > 0) {
              for (const result of results) {
                const event = {
                  text: result.Alternatives[0].Transcript,
                  final: !result.IsPartial,
                  start: result.StartTime,
                  end: result.EndTime,
                  debug: result
                }
                events.emit('data', event)
              }
            }
          }
        } catch (err) {
          events.emit('data', {
            err: `${err.message}`
          })
        }
        events.emit('close')
      }, 0)
    } catch (err) {
      debug(err)
      throw new Error(`AWS Transcribe STT streaming failed: ${err.message}`)
    }
    return {
      events,
      write: (buffer) => {
        audioInputStream.push(buffer)
      },
      end: () => {
        if (audioInputStream) {
          audioInputStream.end()
        }
      },
      close: () => {
        if (audioInputStream) {
          audioInputStream.destroy()
        }
        audioInputStream = null
      }
    }
  }

  async stt (req, { language, buffer, hint }) {

  }
}

module.exports = AwsTranscribeSTT
