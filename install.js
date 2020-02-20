'use strict';

const https = require('https');
const urlParse = require('url').parse;
const fs = require('fs');
const hash = require('crypto').createHash('md5');
const spawn = require('child_process').spawn;

const { binaryPath } = require('./index.js');
const VERSION = '1.9.11-6a62fe39';

function getPayloadInfo (version) {
  const arches = {
    'x32': '386',
    'x64': 'amd64',
    'arm': 'arm7',
    'arm64': 'arm64',
  };
  const checksums = {
    'darwin-amd64': '4214a7c45690fa54c4533fec27e3e83e',
    'linux-386': '842e11d33704b9f392e97e774488f2ec',
    'linux-amd64': '6b226753430e33edf983c5581b52d6d1',
    'linux-arm7': 'b323856641825c49fba96ddf5183c5d9',
    'linux-arm64': '96e69dd734b3bfd05c3da1c6a2cc99d4',
  };
  const platform = process.platform;
  const arch = arches[process.arch];
  const url = `https://gethstore.blob.core.windows.net/builds/geth-${platform}-${arch}-${version}.tar.gz`;
  const md5 = checksums[`${platform}-${arch}`];

  if (!md5) {
    throw new Error(`No checkum for ${url}`);
  }

  return { url, md5 };
}


(async function () {
  process.on('unhandledRejection', function (e) {
    console.log(e);
    process.exit(1);
  });

  const payload = getPayloadInfo(VERSION);

  async function extract (buf, payload) {
    const md5sum = hash.update(buf).digest('hex');

    if (payload.md5 !== md5sum) {
      throw new Error('invalid checksum');
    }

    console.log('valid checksum');

    if (fs.existsSync(binaryPath)) {
      fs.unlinkSync(binaryPath);
    }

    const tar = spawn('tar', ['-xzO', '--exclude', '*/COPYING']);
    const writeStream = fs.createWriteStream(binaryPath, { mode: 0o755 });

    tar.on('exit', function (exitCode) {
      if (exitCode !== 0) {
        throw new Error(`${tar.spawnArgs} exited with ${exitCode}.`);
      }

      console.log(`Written to: ${binaryPath}`);
      process.exit(exitCode);
    });
    tar.stdout.pipe(writeStream);
    tar.stdin.end(buf);
  }

  const fetchOptions = urlParse(payload.url);
  const req = https.request(fetchOptions);
  let body = Buffer.alloc(0);

  req.on('response', function (resp) {
    const len = resp.headers['content-length'] | 0;

    resp.on('data', function (buf) {
      body = Buffer.concat([body, buf]);

      if (len) {
        const has = (body.length / (1024 << 10)).toFixed(2);
        const full = (len / (1024 << 10)).toFixed(2);
        process.stdout.write(`\x1b[1K\x1b[1G${has} / ${full} Mbytes`);
      }
    });

    resp.on('end', function () {
      process.stdout.write('\x1b[1K\x1b[1G');
      extract(body, payload);
    });
  });

  console.log(`fetching: ${payload.url}`);
  req.end();
})();
