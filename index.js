const core = require('@actions/core');
const cache = require('@actions/cache');
const https = require('https');
const fs = require('fs');

// Constants
const cachePaths = ['.cache/*.json'];

let manifestUrl = core.getInput('version-manifest-url');
if (!manifestUrl) {
    manifestUrl = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';
}

let restoreKey = core.getInput('cache-base-key');
if (!restoreKey) {
    restoreKey = 'mc-update-manifest-';
}

async function main(onError) {
    try {
        core.debug("Downloading cached manifest");
        let prevManifest;
        try {
            // Get last version manifest
            await cache.restoreCache(cachePaths, restoreKey + '0', // placeholder string, it should never match
                [restoreKey]);
            core.debug("./ directory contents");
            core.debug(fs.readdirSync("./"));
            const prevManifestData = fs.readFileSync('./.cache/version_manifest_v2.json', 'utf8');

            prevManifest = JSON.parse(prevManifestData);
            core.debug(prevManifestData);
        } catch (error) {
            core.debug(error.message);
            core.debug(error.stack);
        }

        core.debug("Downloading manifest");
        const newManifestStream = fs.createWriteStream('./version_manifest_v2.json');
        https.get(manifestUrl, res => {
            res.pipe(newManifestStream);

            res.on('error', err => {
                onError(err);
            });
            res.on('end', () => {
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

                // Upload this version manifest as cache
                core.debug("Uploading new manifest to cache");
                fs.copyFileSync('./version_manifest_v2.json', '.cache/version_manifest_v2.json');
                const key = restoreKey + Date.now();
                cache.saveCache(cachePaths, key)
                    .then(() => {
                        core.debug('Uploaded cache with key ' + key);
                    })
                    .catch(err => {
                        core.error('Failed to save version manifest to cache');
                        onError(err);
                    });
            });
        });
    } catch (error) {
        onError(error);
    }
}

main(err => {
    core.setFailed(err.message);
    core.error(err.stack);
});
