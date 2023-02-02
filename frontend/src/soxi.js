const { spawn, exec } = require('child_process')
const debug = require('debug')('botium-speech-processing-soxi')

const runShellCommand = (cmdLineFull, inputBuffer = null) => {
  return new Promise((resolve, reject) => {
    const childProcess = spawn('/bin/sh', ['-c', cmdLineFull])

    const childProcessOutput = []
    const childProcessErr = []
    const formatChildProcessErr = (header) => {
      const lines = [
        header,
        ...childProcessErr
      ].filter(l => l).map(l => l.trim()).filter(l => l)
      return lines.join('\n')
    }

    childProcess.once('exit', async (code, signal) => {
      if (code === 0) {
        resolve({
          childProcessOutput
        })
      } else {
        reject(new Error(formatChildProcessErr(`process exited with failure code ${code}${signal ? `, signal ${signal}` : ''}`)))
      }
    })
    childProcess.once('error', (err) => {
      reject(new Error(formatChildProcessErr(err.message)))
    })
    childProcess.stdout.on('error', (err) => {
      debug('stdout err ' + err)
      childProcessErr.push(`${err.message}`)
    })
    childProcess.stdout.on('data', (data) => {
      debug('stdout ' + data)
      childProcessOutput.push(`${data}`)
    })
    childProcess.stderr.on('error', (err) => {
      debug('stderr err ' + err)
      childProcessErr.push(`${err.message}`)
    })
    childProcess.stderr.on('data', (data) => {
      debug('stderr ' + data)
      childProcessErr.push(`${data}`)
    })
    childProcess.stdin.on('error', (err) => {
      debug('stdin err ' + err)
      childProcessErr.push(`${err.message}`)
    })

    if (inputBuffer) {
      childProcess.stdin.write(inputBuffer)
    }
    childProcess.stdin.end()
  })
}

const getSoxFileType = (filename) => {
  return new Promise((resolve, reject) => {
    exec(`soxi -t ${filename}`, (err, stdout, stderr) => {
      if (err) return reject(err)
      if (stderr) return reject(stderr.trim())
      resolve(stdout.trim())
    })
  })
}

const getAudioLengthSeconds = (filenameOrBuffer) => {
  if (Buffer.isBuffer(filenameOrBuffer)) {
    return runShellCommand('soxi -D -', filenameOrBuffer)
      .then(({ childProcessOutput }) => {
        if (childProcessOutput.length > 0) {
          const out = childProcessOutput[0].trim()
          try {
            return parseFloat(out)
          } catch (err) {
            throw new Error(`Parsing SOXI output "${out}" failed: ${err.message}`)
          }
        } else {
          throw new Error('output empty')
        }
      })
      .catch((err) => {
        throw new Error(`Parsing SOXI output failed: ${err.message}`)
      })
  } else {
    return new Promise((resolve, reject) => {
      exec(`soxi -D ${filenameOrBuffer}`, (err, stdout, stderr) => {
        if (err) return reject(err)
        if (stderr) return reject(stderr.trim())
        const out = stdout.trim()
        try {
          return resolve(parseFloat(out))
        } catch (err) {
          return reject(new Error(`Parsing SOXI output "${out}" failed: ${err.message}`))
        }
      })
    })
  }
}

const isBufferMP3 = (buf) => {
  if (!buf || buf.length < 3) {
    return false
  }
  return (buf[0] === 73 &&
    buf[1] === 68 &&
    buf[2] === 51) || (
    buf[0] === 255 &&
      (buf[1] >= 224)
  )
}

module.exports = {
  runShellCommand,
  getSoxFileType,
  getAudioLengthSeconds,
  isBufferMP3
}
