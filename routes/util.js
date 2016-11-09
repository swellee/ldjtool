/**
 * Created by swellee on 2016/9/26.
 */
var fs = require("fs");
var path = require("path");


function mkdirs(dirpath, callback) {
	dirpath = path.resolve(dirpath)
	fs.access(dirpath, fs.F_OK, function(err){
		if (err) {
				var cmd = process.platform == "win32" ? ("mkdir " + dirpath) : ("mkdir -p " + dirpath)
			    require("child_process").execSync(cmd);
		}
		callback && callback();

	})
	
}

function errOut(msg) {
    console.log(msg + "\n-------------按回车键退出---------------");
    process.stdin.resume();
    process.stdin.on("data", function (chunk) {
        process.exit(1);
    });
}

exports.mkdirs = mkdirs;
exports.err = errOut;