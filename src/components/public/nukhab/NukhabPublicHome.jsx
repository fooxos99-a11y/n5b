import React from 'react';
import DeferredPublicRankings from '@/components/public/nukhab/DeferredPublicRankings';
import NukhabPublicHeader from '@/components/public/nukhab/NukhabPublicHeader';
import NukhabPublicHero from '@/components/public/nukhab/NukhabPublicHero';

const NukhabPublicHome = ({
  site,
  hasSession,
  onOpenAccount,
}) => {
  return (
    <>
      <NukhabPublicHeader
        site={site}
        hasSession={hasSession}
        onOpenAccount={onOpenAccount}
      />
      <main>
        <NukhabPublicHero
          site={site}
          hasSession={hasSession}
          onOpenAccount={onOpenAccount}
        />
        <DeferredPublicRankings />
      </main>
    </>
  );
};

export default NukhabPublicHome;
