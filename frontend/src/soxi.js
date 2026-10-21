const { spawn, execFile } = require('child_process')
const debug = require('debug')('botium-speech-processing-soxi')

const soxi = (args) => {
  return new Promise((resolve, reject) => {
    execFile('soxi', args, (err, stdout, stderr) => {
      if (err) return reject(err)
      if (stderr && stderr.trim()) return reject(new Error(stderr.trim()))
      resolve(stdout.trim())
    })
  })
}

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
  return soxi(['-t', filename])
}

const readSoXiDuration = (args, inputBuffer = null) => {
  return new Promise((resolve, reject) => {
    const childProcess = spawn('soxi', args)
    const childProcessOutput = []
    const childProcessErr = []

    let settled = false
    const finish = (err, value) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve(value)
    }

    childProcess.once('error', (err) => {
      finish(err)
    })
    childProcess.stdin.on('error', (err) => {
      debug('stdin err ' + err)
    })
    childProcess.stdout.on('data', (data) => {
      childProcessOutput.push(`${data}`)
    })
    childProcess.stderr.on('data', (data) => {
      childProcessErr.push(`${data}`)
    })
    childProcess.once('exit', (code) => {
      if (code !== 0) {
        finish(new Error(childProcessErr.join('').trim() || `soxi exited with code ${code}`))
        return
      }
      const out = childProcessOutput.join('').trim()
      const duration = parseFloat(out)
      if (!out || Number.isNaN(duration)) {
        finish(new Error(`Parsing SOXI output "${out}" failed`))
        return
      }
      finish(null, duration)
    })

    try {
      if (inputBuffer) {
        childProcess.stdin.write(inputBuffer)
      }
      childProcess.stdin.end()
    } catch (err) {
      debug('stdin write err ' + err)
    }
  })
}

const getAudioLengthSeconds = (filenameOrBuffer) => {
  if (Buffer.isBuffer(filenameOrBuffer)) {
    return readSoXiDuration(['-D', '-'], filenameOrBuffer)
  }
  return readSoXiDuration(['-D', filenameOrBuffer])
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
