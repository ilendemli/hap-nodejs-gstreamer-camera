const hap = require("hap-nodejs")

const [Accessory, Service, Characteristic, Categories] = [
  hap.Accessory,
  hap.Service,
  hap.Characteristic,
  hap.Categories
]

const pluginSource = require("./plugin")

const accessoryId = hap.uuid.generate(pluginSource.mac)
const accessory = new Accessory("IPCamera", accessoryId)

const cameraSource = require("./camera")
cameraSource.configureController(accessory)

accessory
  .getService(Service.AccessoryInformation)
  .setCharacteristic(Characteristic.Manufacturer, "Manufacturer")
  .setCharacteristic(Characteristic.Model, "Model")
  .setCharacteristic(Characteristic.SerialNumber, "SerialNumber")

const configuration = {
  username: pluginSource.mac,
  pincode: pluginSource.pin,
  category: Categories.IP_CAMERA
}

accessory.publish(configuration)

console.log("running")
