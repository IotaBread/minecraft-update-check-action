const core = require('@actions/core');
const cache = require('@actions/cache');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

// Constants
const cachePaths = ['.cache'];

let manifestUrl = core.getInput('version-manifest-url');
if (!manifestUrl) {
    manifestUrl = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';
}

let restoreKey = core.getInput('cache-base-key');
if (!restoreKey) {
    restoreKey = 'mc-update-manifest-';
}

async function main() {
    try {
        core.debug("Downloading cached manifest");
        let prevManifest;
        try {
            // Get last version manifest
            await cache.restoreCache(cachePaths, restoreKey + '0', // placeholder string, it should never match
                [restoreKey]);
            const prevManifestData = fs.readFileSync('./.cache/version_manifest_v2.json', 'utf8');
        
            prevManifest = JSON.parse(prevManifestData);
            core.debug(prevManifestData);
        } catch (error) {}

        core.debug("Downloading manifest");
        const newManifestStream = fs.createWriteStream('./version_manifest_v2.json');
        // Wrap it in a promise to allow awaiting
        await new Promise((resolve) => {
            https.get(manifestUrl, res => {
                res.pipe(newManifestStream)
                res.on('end', () => resolve())
            });
        });
        const manifestData = fs.readFileSync('./version_manifest_v2.json', 'utf8');
        core.debug(manifestData);

        const manifest = JSON.parse(manifestData);

        // Compare manifest if present
        if (prevManifest) {
            core.debug("Comparing manifests");
            const prevVersions = prevManifest["versions"];
            const versions = manifest["versions"];

            const removeCommon = (a, b) => {
                const spreaded = [...a, ...b];
                return spreaded.filter(v => !(a.includes(e) && b.includes(e)));
            }
            const newVersions = removeCommon(prevVersions, versions);
            if (newVersions.length == 1) {
                const newVersion = newVersions[0];
                core.info("Found a new Minecraft version (of type '" + newVersion["type"] + "'): " + newVersion["id"]);
                core.setOutput('id', newVersion["id"]);
                core.setOutput('type', newVersion["type"]);
                core.setOutput('url', newVersion["url"]);
            } else {
                if (newVersions.length > 1) {
                    const newVersionIds = newVersions.map(v => v["id"]);
                    core.warning("Found more than one new Minecraft version: " + newVersionIds);
                } else {
                    core.debug("No new versions found");
                }

                core.setOutput('id', '');
                core.setOutput('type', '');
                core.setOutput('url', '');
            }
        }

        // Generate a hash for the cache key
        core.debug("Generating file hash");
        const fileHash = await new Promise(resolve => {
            const hash = crypto.createHash('md5');
            const stream = fs.createReadStream('./version_manifest_v2.json');
            stream.on('data', chunk => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
        });

        // Upload this version manifest as cache
        core.debug("Uploading new manifest to cache");
        const key = restoreKey + Date.now();
        try {
            await cache.saveCache(cachePaths, key);
            core.debug('Uploaded cache with key ' + key);
        } catch (error) {
            core.error('Failed to save version manifest to cache');
            throw error;
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

main()
