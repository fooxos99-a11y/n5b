const formatter = new Intl.NumberFormat('ar-SA-u-nu-latn', {
  useGrouping: false,
  maximumFractionDigits: 0,
});

export const formatStatisticsNumber = value => formatter.format(Number(value || 0));
