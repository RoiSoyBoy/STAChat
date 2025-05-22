// @ts-check

/**
 * @type {import('next-i18next').UserConfig}
 */
module.exports = {
  i18n: {
    defaultLocale: 'he',
    locales: ['he', 'en'], // Hebrew as default, English as another option
  },
  /** To avoid issues when deploying to some platforms (vercel) */
  localePath:
    typeof window === 'undefined'
      ? require('path').resolve('./public/locales')
      : '/locales',

  reloadOnPrerender: process.env.NODE_ENV === 'development',

  // If you are using i18next.default. χρήση nsSeparator in your i18next config, change it to
  // nsSeparator: '::', // or whatever separator you want
};
