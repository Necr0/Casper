const {task, series, parallel, watch, src, dest} = require('gulp');
const pump = require('pump');

// gulp plugins and utils
const livereload = require('gulp-livereload');
const sass = require("gulp-sass");
const postcss = require('gulp-postcss');
const zip = require('gulp-zip');
const uglify = require('gulp-uglify');
const beeper = require('beeper');

// postcss plugins
const autoprefixer = require('autoprefixer');
const colorFunction = require('postcss-color-function');
const cssnano = require('cssnano');
const customProperties = require('postcss-custom-properties');
const easyimport = require('postcss-easy-import');


const handleError = (done) => {
    return function (err) {
        if (err) {
            beeper();
        }
        return done(err);
    };
};


task("serve", function(done){
    livereload.listen();
    done();
});

task("watch", function(){ watch('assets/css/**', css)});

task("css", function(done){
    return pump([
        src(['assets/css/*.scss','!assets/css/_*.scss'], {sourcemaps: true}),
        sass(),
        postcss([
            easyimport,
            customProperties({preserve: false}),
            colorFunction(),
            autoprefixer({browsers: ['last 2 versions']}),
            cssnano()
        ]),
        dest('assets/built/', {sourcemaps: '.'}),
        livereload()
    ], handleError(done));
});

task("js", function(done){
    return pump([
        src('assets/js/*.js', {sourcemaps: true}),
        uglify(),
        dest('assets/built/', {sourcemaps: '.'}),
        livereload()
    ], handleError(done));
});



task("build", parallel("css", "js"));
task("dev", series("build", "serve", "watch"));
task("default",series("dev"));
task("zip", series("build"), function(done){
    const themeName = require('./package.json').name;

    return pump([
        src([
            '**',
            '!node_modules', '!node_modules/**',
            '!dist', '!dist/**'
        ]),
        zip(themeName + '.zip'),
        dest('dist/')
    ], handleError(done));
});



// release imports
const path = require('path');
const releaseUtils = require('@tryghost/release-utils');

let config;
try {
    config = require('./config');
} catch (err) {
    config = null;
}

const REPO = 'Necr0/Casper';
const USER_AGENT = 'Casper';
const CHANGELOG_PATH = path.join(process.cwd(), '.', 'changelog.md');

const changelog = ({previousVersion}) => {
    const changelog = new releaseUtils.Changelog({
        changelogPath: CHANGELOG_PATH,
        folder: path.join(process.cwd(), '.')
    });

    changelog
        .write({
            githubRepoPath: `https://github.com/${REPO}`,
            lastVersion: previousVersion
        })
        .sort()
        .clean();
};

const previousRelease = () => {
    return releaseUtils
        .releases
        .get({
            userAgent: USER_AGENT,
            uri: `https://api.github.com/repos/${REPO}/releases`
        })
        .then((response) => {
            if (!response || !response.length) {
                console.log('No releases found. Skipping');
                return;
            }

            console.log(`Previous version ${response[0].name}`);
            return response[0].name;
        });
};

/**
 *
 * `yarn ship` will trigger `postship` task.
 *
 * [optional] For full automation
 *
 * `GHOST=2.10.1,2.10.0 yarn ship`
 * First value: Ships with Ghost
 * Second value: Compatible with Ghost/GScan
 *
 * You can manually run in case the task has thrown an error.
 *
 * `npm_package_version=0.5.0 gulp release`
 */
const release = () => {
    // @NOTE: https://yarnpkg.com/lang/en/docs/cli/version/
    const newVersion = process.env.npm_package_version;
    let shipsWithGhost = '{version}';
    let compatibleWithGhost = '2.10.0';
    const ghostEnvValues = process.env.GHOST || null;

    if (ghostEnvValues) {
        shipsWithGhost = ghostEnvValues.split(',')[0];
        compatibleWithGhost = ghostEnvValues.split(',')[1];

        if (!compatibleWithGhost) {
            compatibleWithGhost = '2.10.0';
        }
    }

    if (!newVersion || newVersion === '') {
        console.log('Invalid version.');
        return;
    }

    console.log(`\nDraft release for ${newVersion}.`);

    if (!config || !config.github || !config.github.username || !config.github.token) {
        console.log('Please copy config.example.json and configure Github token.');
        return;
    }

    return previousRelease()
        .then((previousVersion)=> {

            changelog({previousVersion});

            return releaseUtils
                .releases
                .create({
                    draft: true,
                    preRelease: false,
                    tagName: newVersion,
                    releaseName: newVersion,
                    userAgent: USER_AGENT,
                    uri: `https://api.github.com/repos/${REPO}/releases`,
                    github: {
                        username: config.github.username,
                        token: config.github.token
                    },
                    content: [`**Ships with Ghost ${shipsWithGhost} Compatible with Ghost >= ${compatibleWithGhost}**\n\n`],
                    changelogPath: CHANGELOG_PATH
                })
                .then((response)=> {
                    console.log(`\nRelease draft generated: ${response.releaseUrl}\n`);
                });
        });
};

exports.release = release;
