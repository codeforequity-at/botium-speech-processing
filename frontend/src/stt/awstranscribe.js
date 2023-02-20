const _ = require('lodash')
const { v1: uuidv1 } = require('uuid')
const axios = require('axios').default
const { TranscribeStreamingClient, StartStreamTranscriptionCommand, MediaEncoding } = require('@aws-sdk/client-transcribe-streaming')
const { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand, DeleteTranscriptionJobCommand, TranscriptionJobStatus } = require('@aws-sdk/client-transcribe')
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const { PassThrough } = require('stream')
const EventEmitter = require('events')

const debug = require('debug')('botium-speech-processing-awstranscribe-stt')

const { awstranscribeOptions, applyIfExists } = require('../utils')

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
      MediaEncoding: MediaEncoding.PCM,
      MediaSampleRateHertz: 16000,
      AudioStream: audioStream()
    }
    applyIfExists(request, req, 'req.body.awstranscribe.config.streaming')

    const events = new EventEmitter()
    try {
      const cmdResponse = await transcribeClient.send(new StartStreamTranscriptionCommand(request))
      setTimeout(async () => {
        try {
          debug('Starting to listen to TranscriptResultStream ')
          for await (const event of cmdResponse.TranscriptResultStream) {
            const results = _.get(event, 'TranscriptEvent.Transcript.Results')
            if (results && results.length > 0) {
              for (const result of results) {
                const event = {
                  status: 'ok',
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
          debug(`TranscriptResultStream failure: ${err.Message || err.message || err}`)
          events.emit('data', {
            status: 'error',
            err: `${err.message || err}`
          })
        }
        events.emit('close')
        debug('Ready listening to TranscriptResultStream ')
      }, 0)
    } catch (err) {
      debug(`StartStreamTranscriptionCommand failure: ${err.Message || err.message || err}`)
      throw new Error(`AWS Transcribe STT streaming failed: ${err.Message || err.message || err}`)
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
    const transcribeClient = new TranscribeClient(awstranscribeOptions(req))
    const s3Client = new S3Client(awstranscribeOptions(req))

    const jobId = uuidv1()

    const putRequest = {
      Bucket: _.get(req, 'body.awstranscribe.credentials.bucket') || process.env.BOTIUM_SPEECH_AWS_S3_BUCKET || 'botium-speech-processing',
      Key: `botium-transcribe-source-${jobId}`
    }
    applyIfExists(putRequest, req, 'req.body.awstranscribe.config.s3')

    const transcribeJobRequest = {
      TranscriptionJobName: `botium-transcribe-job-${jobId}`,
      LanguageCode: language,
      Media: {
        MediaFileUri: `s3://${putRequest.Bucket}/${putRequest.Key}`
      }
    }
    applyIfExists(putRequest, req, 'req.body.awstranscribe.config.transcribe')

    try {
      await s3Client.send(new PutObjectCommand({
        ...putRequest,
        Body: buffer
      }))
    } catch (err) {
      throw new Error(`S3 Upload to ${putRequest.Bucket}/${putRequest.Key} failure:  ${err.message || err}`)
    }

    try {
      let transcriptionJob = null
      try {
        const transcribeJobResponse = await transcribeClient.send(new StartTranscriptionJobCommand(transcribeJobRequest))
        transcriptionJob = transcribeJobResponse.TranscriptionJob
      } catch (err) {
        throw new Error(`Creating Transcription Job for ${transcribeJobRequest.Media.MediaFileUri} failure:  ${err.message || err}`)
      }

      while (true) {
        try {
          const jobStatus = await transcribeClient.send(new GetTranscriptionJobCommand({
            TranscriptionJobName: transcriptionJob.TranscriptionJobName
          }))
          debug(`Checking Transcription Job for ${transcribeJobRequest.Media.MediaFileUri} status: ${JSON.stringify(jobStatus.TranscriptionJob)}`)
          if (jobStatus.TranscriptionJob.TranscriptionJobStatus === TranscriptionJobStatus.COMPLETED) {
            try {
              const transcriptionFile = await axios.get(jobStatus.TranscriptionJob.Transcript.TranscriptFileUri)
              return {
                text: _.get(transcriptionFile.data, 'results.transcripts[0].transcript'),
                debug: transcriptionFile.data
              }
            } catch (err) {
              throw new Error(`Downloading Transcription Result for ${transcribeJobRequest.Media.MediaFileUri} failure:  ${err.message || err}`)
            }
          } else if (jobStatus.TranscriptionJob.TranscriptionJobStatus === TranscriptionJobStatus.FAILED) {
            throw new Error(`Transcription Job for ${transcribeJobRequest.Media.MediaFileUri} failed, reason:  ${jobStatus.TranscriptionJob.FailureReason}`)
          } else {
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        } catch (err) {
          throw new Error(`Checking Transcription Job Status for ${transcribeJobRequest.Media.MediaFileUri} failure:  ${err.message || err}`)
        }
      }
    } finally {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: putRequest.Bucket,
          Key: putRequest.Key
        }))
      } catch (err) {
        debug(`Deleting S3 Object ${putRequest.Bucket}/${putRequest.Key} failure:  ${err.message || err}`)
      }
      try {
        await transcribeClient.send(new DeleteTranscriptionJobCommand({
          TranscriptionJobName: transcribeJobRequest.TranscriptionJobName
        }))
      } catch (err) {
        debug(`Deleting Transcription Job ${transcribeJobRequest.TranscriptionJobName} failure:  ${err.message || err}`)
      }
    }
  }
}

module.exports = AwsTranscribeSTT
