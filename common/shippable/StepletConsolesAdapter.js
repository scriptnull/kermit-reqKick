'use strict';

var self = StepletConsolesAdapter;
module.exports = self;

var _ = require('underscore');
var uuid = require('node-uuid');
var util = require('util');
var ShippableAdapter = require('./APIAdapter.js');

function StepletConsolesAdapter(apiUrl, apiToken, stepletId, pipelineId) {
  this.who = util.format(
    '%s|common|shippable|ConsolesAdapter|stepletId:%s', global.who,
    stepletId);
  this.stepletId = stepletId;
  this.pipelineId = pipelineId;

  this.startTimeInMicroSec = new Date().getTime() * 1000;
  var processStartTime = process.hrtime();
  this.processStartTimeInMicroSec =
    processStartTime[0] * 1e6 + processStartTime[1] / 1e3;
  this.ShippableAdapter = new ShippableAdapter(apiUrl, apiToken);
  this.batchSize = 20;
  this.buffer = [];
  this.bufferTimeInterval = 3000;
  this.bufferTimer = null;
  this.pendingApiCalls = 0;
}

StepletConsolesAdapter.prototype.openGrp = function (consoleGrpName) {
  var that = this;
  that.consoleGrpName = consoleGrpName;
  that.consoleGrpId = uuid.v4();

  var consoleGrp = {
    stepletId: that.stepletId,
    consoleId: that.consoleGrpId,
    parentConsoleId: 'root',
    type: 'grp',
    message: that.consoleGrpName,
    timestamp: that._getTimestamp(),
    isShown: true
  };

  that.buffer.push(consoleGrp);
  that._postToStepConsole(true);
};

StepletConsolesAdapter.prototype.closeGrp = function (isSuccess) {
  var that = this;

  //The grp is already closed
  if (!that.consoleGrpName)
    return;

  if (!_.isBoolean(isSuccess)) isSuccess = true;

  that.closeCmd();

  var consoleGrp = {
    stepletId: that.stepletId,
    consoleId: that.consoleGrpId,
    parentConsoleId: 'root',
    type: 'grp',
    message: that.consoleGrpName,
    timestamp: that._getTimestamp(),
    timestampEndedAt: that._getTimestamp(),
    isSuccess: isSuccess,
    isShown: true
  };

  that.buffer.push(consoleGrp);
  that._postToStepConsole(true);
  that.consoleGrpName = null;
  that.consoleGrpId = null;
};

StepletConsolesAdapter.prototype.openCmd = function (consoleCmdName) {
  var that = this;
  that.consoleCmdName = consoleCmdName;
  that.consoleCmdId = uuid.v4();

  var consoleGrp = {
    stepletId: that.stepletId,
    consoleId: that.consoleCmdId,
    parentConsoleId: that.consoleGrpId,
    type: 'cmd',
    message: that.consoleCmdName,
    timestamp: that._getTimestamp(),
    isShown: true
  };

  that.buffer.push(consoleGrp);
  that._postToStepConsole(true);
};

StepletConsolesAdapter.prototype.closeCmd = function (isSuccess) {
  var that = this;

  //The cmd is already closed
  if (!that.consoleCmdName)
    return;

  if (!_.isBoolean(isSuccess)) isSuccess = true;

  var consoleGrp = {
    stepletId: that.stepletId,
    consoleId: that.consoleCmdId,
    parentConsoleId: that.consoleGrpId,
    type: 'cmd',
    message: that.consoleCmdName,
    timestamp: that._getTimestamp(),
    timestampEndedAt: that._getTimestamp(),
    isSuccess: isSuccess,
    isShown: false
  };

  that.buffer.push(consoleGrp);
  that._postToStepConsole(true);
  that.consoleCmdName = null;
  that.consoleCmdId = null;
};

StepletConsolesAdapter.prototype.publishMsg = function (message) {
  var that = this;

  var consoleGrp = {
    stepletId: that.stepletId,
    consoleId: uuid.v4(),
    parentConsoleId: that.consoleCmdId,
    type: 'msg',
    message: message,
    timestamp: that._getTimestamp(),
    isShown: true
  };

  that.buffer.push(consoleGrp);
  that._postToStepConsole(false);
};

StepletConsolesAdapter.prototype._postToStepConsole = function (forced) {
  var that = this;
  var who = that.who + '|_postToStepConsole';

  if (that.buffer.length > that.batchSize || forced) {
    if (that.bufferTimer) {
      // If a timeout has been set for the buffer, clear it.
      clearTimeout(that.bufferTimer);
      that.bufferTimer = null;
    }

    var consoles = that.buffer.splice(0, that.buffer.length);

    if (consoles.length === 0)
      return;

    var body = {
      stepletId: that.stepletId,
      pipelineId: that.pipelineId,
      stepConsoles: consoles
    };

    that.pendingApiCalls ++;
    that.ShippableAdapter.postStepletConsoles(body,
      function (err) {
        that.pendingApiCalls --;
        if (err)
          logger.error(who, 'postStepletConsoles Failed', err);
        logger.debug(who, 'Succeeded');
      }
    );
  } else if (!that.bufferTimer) {
    // Set a timeout that will clear the buffer in three seconds if nothing has.
    that.bufferTimer = setTimeout(
      function () {
        this._postToStepConsole(true);
      }.bind(that),
      that.bufferTimeInterval);
  }
};

StepletConsolesAdapter.prototype.getPendingApiCallCount = function() {
  var that = this;
  return that.pendingApiCalls;
};

StepletConsolesAdapter.prototype._getTimestamp = function () {
  var that = this;
  var currentProcessTime = process.hrtime();

  return Math.round(that.startTimeInMicroSec +
    (currentProcessTime[0] * 1e6 + currentProcessTime[1]/1e3) -
      that.processStartTimeInMicroSec);
};
