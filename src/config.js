/* eslint-disable no-multi-spaces */
import { createRequire } from 'module'
import { exit } from 'process'
const require = createRequire(import.meta.url)
const globalCfg = require('./config/global.json')

class Configuration {
  constructor (_serviceCfgPath, _securityChecksBeforeStart) {
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    //    ____             __ _
    //   / ___|___  _ __  / _(_) __ _
    //  | |   / _ \| '_ \| |_| |/ _` |
    //  | |__| (_) | | | |  _| | (_| |
    //   \____\___/|_| |_|_| |_|\__, |
    //                          |___/
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Internal Checks & CFG
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    this.numberOfArguments = 1
    _securityChecksBeforeStart(this.numberOfArguments)

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Global & Service
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    this.globalCfg = globalCfg

    this.serviceCfg = require(_serviceCfgPath)
    this.databaseEnv = this.serviceCfg.database.enviroment
    this.networkName = this.serviceCfg.networkName
    this.formatEther = this.serviceCfg.contract.formatEther.split(', ')
    this.WSS_URL = globalCfg.networks[this.networkName].wss

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Fill JSON matching selected serviceCfg
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    this.serviceCfg.contract.json = require(this.serviceCfg.contract.pathToAbi)
  }
}

export default Configuration
