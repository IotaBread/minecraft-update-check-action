const core = require('@actions/core');
const cache = require('@actions/cache');
const https = require('https');
const fs = require('fs');

// Constants
const cachePaths = ['./.cache/*.json'];
const manifestPath = './.cache/version_manifest_v2.json';
const prevManifestPath = './version_manifest_v2.json';

let manifestUrl = core.getInput('version-manifest-url');
if (!manifestUrl) {
    manifestUrl = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';
}

let restoreKey = core.getInput('cache-base-key');
if (!restoreKey) {
    restoreKey = 'mc-update-manifest-';
}

const debugDisableCacheStoring = core.getBooleanInput('debug-disable-cache-storing');

async function main(onError) {
    try {
        core.debug("Downloading cached manifest");
        let prevManifest;
        try {
            // Get last version manifest
            await cache.restoreCache(cachePaths, restoreKey + '0', // placeholder string, it should never match
                [restoreKey]);
            if (fs.existsSync(manifestPath)) {
                fs.renameSync(manifestPath, prevManifestPath);
                const prevManifestData = fs.readFileSync(prevManifestPath, 'utf8');

                prevManifest = JSON.parse(prevManifestData);
                core.debug(prevManifestData);
            }
        } catch (error) {
            core.debug(error.message);
            core.debug(error.stack);
        }

        if (!fs.existsSync('./.cache/')) {
            core.debug("Creating `./.cache` directory");
            fs.mkdirSync('./.cache/')
        }

        core.debug("Downloading manifest");
        const newManifestStream = fs.createWriteStream(manifestPath);
        https.get(manifestUrl, res => {
            res.pipe(newManifestStream);

            res.on('error', err => {
                onError(err);
            });
            newManifestStream.on('finish', () => {
                const manifestData = fs.readFileSync(manifestPath, 'utf8');
                core.debug(manifestData);

                const manifest = JSON.parse(manifestData);

                // Compare manifest if present
                if (prevManifest) {
                    core.debug("Comparing manifests");
                    const prevVersions = prevManifest["versions"];
                    const versions = manifest["versions"];

                    const versionInfoMapper = v => v["id"] + "@" + v["type"] + ":" + v["url"];
                    const findNewVersions = (prev, current) => {
                        const oldIds = prev.map(versionInfoMapper);
                        const currentIds = current.map(versionInfoMapper);
                        const spreaded = [...oldIds, ...currentIds];
                        return spreaded.filter(o => !oldIds.includes(o) && currentIds.includes(o));
                    };
                    const findRemovedVersions = (prev, current) => {
                        const oldIds = prev.map(versionInfoMapper);
                        const currentIds = current.map(versionInfoMapper);
                        const spreaded = [...oldIds, ...currentIds];
                        return spreaded.filter(o => oldIds.includes(o) && !currentIds.includes(o));
                    };

                    const removedVersions = findRemovedVersions(prevVersions, versions);
                    const newVersions = findNewVersions(prevVersions, versions);
                    if (newVersions.length == 1 && removedVersions.length == 0) {
                        const newVersion = newVersions[0];
                        const id = newVersion.substring(0, newVersion.indexOf("@"));
                        const type = newVersion.substring(newVersion.indexOf("@") + 1, newVersion.indexOf(":"));
                        const url = newVersion.substring(newVersion.indexOf(":") + 1);
                        core.info("Found a new Minecraft version (of type '" + type + "'): " + id);
                        core.setOutput('id', id);
                        core.setOutput('type', type);
                        core.setOutput('url', url);
                    } else {
                        const versionIdAndTypeGetter = v => `'${v.substring(0, v.indexOf(":"))}'`;

                        if (removedVersions.length > 0) {
                            const removedVersionInfos = removedVersions.map(versionIdAndTypeGetter);
                            core.warning("Found removed Minecraft versions:" + removedVersionInfos.join(', '))
                        }
                        if (newVersions.length > 1) {
                            const newVersionInfos = newVersions.map(versionIdAndTypeGetter);
                            core.warning("Found more than one new Minecraft version:\n" + newVersionInfos.join(', '));
                        } else {
                            core.debug("No new versions found");
                        }

                        core.setOutput('id', '');
                        core.setOutput('type', '');
                        core.setOutput('url', '');
                    }
                }

                if (debugDisableCacheStoring && debugDisableCacheStoring === true) {
                    core.debug("Cache storing disabled!");
                    return;
                }

                // Upload this version manifest as cache
                core.debug("Uploading new manifest to cache");
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
