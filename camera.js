const hap = require("hap-nodejs")

const crypto = require("crypto")
const ip = require("ip")
const child_process = require("child_process")

const [Accessory, CameraController, StreamRequestTypes, H264Level, H264Profile, SRTPCryptoSuites] = [
  hap.Accessory,
  hap.CameraController,
  hap.StreamRequestTypes,
  hap.H264Level,
  hap.H264Profile,
  hap.SRTPCryptoSuites
]

const STREAM_URL = "rtsp://192.168.1.59"

const FFMPEGH264ProfileNames = [
  "baseline",
  "main",
  "high"
]

const FFMPEGH264LevelNames = [
  "3.1",
  "3.2",
  "4.0"
]

const ExampleCamera = (function () {
  function ExampleCamera() {
    this.pendingSessions = []
    this.ongoingSessions = []
    this.running = false
  }

  ExampleCamera.prototype.handleSnapshotRequest = function(request, callback) {
    const e = new Error("not implemented yet")
    callback(e)
  }

  // called when iOS request rtp setup
  ExampleCamera.prototype.prepareStream = function(request, callback) {
    let response = {}
    let sessionInfo = {}

    const sessionID = request.sessionID

    const video = request.video
    const audio = request.audio

    const targetAddress = request.targetAddress

    if (video) {
      const videoPort = video.port
      const videoCryptoSuite = video.srtpCryptoSuite  // could be used to support multiple crypto suite (or support no suite for debugging)
      const videoSrtpKey = video.srtp_key
      const videoSrtpSalt = video.srtp_salt
      const videoSSRC = CameraController.generateSynchronisationSource()

      // // SSRC is a 32 bit integer that is unique per stream
      // let ssrcSource = crypto.randomBytes(4)
      // ssrcSource[0] = 0
      // const ssrc = ssrcSource.readInt32BE(0)

      sessionInfo = {
        address: targetAddress,
        videoPort: videoPort,
        videoCryptoSuite: videoCryptoSuite,
        videoSRTP: Buffer.concat([videoSrtpKey, videoSrtpSalt]),
        videoSSRC: videoSSRC
      }

      const currentAddress = ip.address("public", request.addressVersion); // ipAddress version must match

      response = {
        address: currentAddress,
        video: {
          port: videoPort,
          ssrc: videoSSRC,
          srtp_key: videoSrtpKey,
          srtp_salt: videoSrtpSalt
        }
      }
    }

    // const audioInfo = request["audio"]
    // if (audioInfo) {
      // const targetPort = audioInfo["port"]
      // const srtp_key = audioInfo["srtp_key"]
      // const srtp_salt = audioInfo["srtp_salt"]

      // // SSRC is a 32 bit integer that is unique per stream
      // let ssrcSource = crypto.randomBytes(4)
      // ssrcSource[0] = 0
      // const ssrc = ssrcSource.readInt32BE(0)

      // response["audio"] = {
        // port: targetPort,
        // srtp_key: srtp_key,
        // srtp_salt: srtp_salt,
        // ssrc: ssrc
      // }

      // sessionInfo["audio_port"] = targetPort
      // sessionInfo["audio_srtp"] = Buffer.concat([srtp_key, srtp_salt])
      // sessionInfo["audio_ssrc"] = ssrc
    // }

    // const currentAddress = ip.address()
    // response["address"] = {
      // address: currentAddress,
      // type: ip.isV4Format(currentAddress) ? "v4" : "v6"
    // }

    // sessionInfo["address"] = request["targetAddress"]

    // const sessionID = request["sessionID"]
    // const sessionIdentifier = uuid.unparse(sessionID)
    this.pendingSessions[sessionID] = sessionInfo

    callback(null, response)
  }
  
  // called when iOS device asks stream to start/stop/reconfigure
  ExampleCamera.prototype.handleStreamRequest = function(request, callback) {
    const sessionID = request.sessionID
  
    switch (request.type) {
    case StreamRequestTypes.START:
      const sessionInfo = this.pendingSessions[sessionID]
    
      if (sessionInfo) {
        let width = 1024
        let height = 768
        let fps = 30
        let bitrate = 300
        let pt = 99
        let mtu = 1378

        const video = request.video
        if (video) {
          width = video.width
          height = video.height
          bitrate = video.max_bit_rate
          pt = video.pt
          mtu = video.mtu
          fps = Math.max(video.fps, fps)
        }

        const address = sessionInfo.address
        const port = sessionInfo.videoPort
        const srtp = sessionInfo.videoSRTP
        const ssrc = sessionInfo.videoSSRC
        const cryptoSuite = sessionInfo.videoCryptoSuite
        
        const key = srtp.toString("hex")

        let gst = 'uridecodebin uri="{{location}}" ! videoconvert ! videoscale ! videorate ! video/x-raw, width={{width}}, height={{height}}, framerate={{fps}}/1 ! v4l2h264enc ! rtph264pay pt={{pt}} mtu={{mtu}} ssrc={{ssrc}} ! srtpenc key={{key}} ! udpsink host={{address}} port={{port}}'			
        gst = gst.replace(/{{location}}/, STREAM_URL)
        gst = gst.replace(/{{width}}/, width)
        gst = gst.replace(/{{height}}/, height)
        gst = gst.replace(/{{fps}}/, fps)
        gst = gst.replace(/{{pt}}/, pt)
        gst = gst.replace(/{{mtu}}/, mtu)
        gst = gst.replace(/{{ssrc}}/, ssrc)
        gst = gst.replace(/{{key}}/, key)
        gst = gst.replace(/{{address}}/, address)
        gst = gst.replace(/{{port}}/, port)
        gst = gst.replace(/{{bitrate}}/g, bitrate)

        console.log('gst-launch-1.0', gst)

        const arguments = gst.split(' ')
        const process = child_process.spawn('gst-launch-1.0', arguments)

        process.stderr.on('data', (data) => {
          const e = data.toString()
          callback(e)
        })
        
        process.on('exit', (code, signal) => {
          console.log(code, signal)
          
          if (this.running) {
            this.controller.forceStopStreamingSession(sessionID)
          }
        })
        
        process.on('uncaughtException', (e) => {
          console.log(e)
        })
        
        callback() // do not forget to execute callback once set up

        this.ongoingSessions[sessionID] = process
      }
        
      delete this.pendingSessions[sessionID]
      break
    
    case StreamRequestTypes.RECONFIGURE:
      callback()
      break
      
    case StreamRequestTypes.STOP:
      const ongoingSession = this.ongoingSessions[sessionID]

      try {
        if (ongoingSession) {
          ongoingSession.kill('SIGKILL')
        }
      
      } catch (e) {
        console.log(e)
      }

      delete this.ongoingSessions[sessionID]
      
      callback()
      break
    }
  }
  
  ExampleCamera.prototype.setController = function(controller) {
    this.controller = controller
  }
  
  return ExampleCamera
}());

const streamDelegate = new ExampleCamera()

const cameraControllerOptions = {
  cameraStreamCount: 2,
  delegate: streamDelegate,
  streamingOptions: {
    // srtp: true, // legacy option which will just enable AES_CM_128_HMAC_SHA1_80 (can still be used though)
    supportedCryptoSuites: [
      SRTPCryptoSuites.NONE,
      SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80
    ],
    video: {
      codec: {
        profiles: [
          H264Profile.BASELINE, 
          H264Profile.MAIN,
          H264Profile.HIGH
        ],
        levels: [
          H264Level.LEVEL3_1, 
          H264Level.LEVEL3_2, 
          H264Level.LEVEL4_0
        ] // Enum, please refer StreamController.VideoCodecParamLevelTypes
      },
      resolutions: [
        [1920, 1080, 30], // width, height, framerate
        [1280, 960, 30],
        [1280, 720, 30],
        [1024, 768, 30],
        [640, 480, 30],
        [640, 360, 30],
        [480, 360, 30],
        [480, 270, 30],
        [320, 240, 30],
        [320, 240, 15], // Apple Watch requires this configuration (Apple Watch also seems to required OPUS @16K)
        [320, 180, 30],
      ]
    },
    /* audio option is omitted, as it is not supported in this example; HAP-NodeJS will fake an appropriate audio codec
    audio: {
      comfort_noise: false,
      codecs: [
        {
          type: "OPUS",
          samplerate: 24 // 8, 16, 24 KHz
        },
        {
          type: "AAC-eld",
          samplerate: 16
        }
      ]
    }
    */
  }
}

module.exports = {
  configureController: (accessory) => {
    const cameraController = new CameraController(cameraControllerOptions)
    streamDelegate.setController(cameraController)
    accessory.configureController(cameraController)
  }
}
