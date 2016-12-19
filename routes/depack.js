var dust = require('dustjs-linkedin');
var util = require('./util.js');
var path = require("path");
var fs = require("fs");
var os = require("os");

var userCfgPath = path.join(os.homedir(), ".ldjtool", "cfg.json");
var cfg = require(userCfgPath);


module.exports = function(file) {
	console.log("该功能尚不可用")
	return;
	var clientDir = cfg.clientDir;
	var baseUiPackgeIdr = cfg.baseUiPackgeIdr;

	var fpath = path.dirname(path.relative(clientDir, file));
    var fname = path.basename(file);
	
	var md_def = fs.readFileSync(path.resolve(clientDir, "module.def"), {encoding: "utf8"}) ;

}