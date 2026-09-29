const nukhabSiteConfig = {
  key: 'nukhab',
  registrationNumber: 'platform',
  name: 'نخب',
  shortName: 'نخب',
  description: 'تطبيق نخب',
  logo: 'branding/nukhab/nukhab-color.png',
  squareLogo: 'branding/nukhab/icon-512.png',
  whatsappUrl: '',
  themeColor: '#04433D',
  appUrl: 'https://161.97.171.108.sslip.io/n5b',
  apiUrl: 'https://161.97.171.108.sslip.io/n5b/api',
  features: { store: true, studentHome: true },
};


const siteConfigs = {
  nukhab: nukhabSiteConfig,
};

const configuredSiteKey = String(process.env.SITE_KEY || 'nukhab').trim().toLowerCase();
export const siteKey = siteConfigs[configuredSiteKey] ? configuredSiteKey : 'nukhab';
export const siteName = siteConfigs[siteKey].name;

export function getSiteConfig() {
  return {
    ...siteConfigs[siteKey],
    registrationNumber: process.env.SITE_REGISTRATION_NUMBER ?? siteConfigs[siteKey].registrationNumber,
    whatsappUrl: process.env.PUBLIC_WHATSAPP_URL ?? siteConfigs[siteKey].whatsappUrl,
  };
}
