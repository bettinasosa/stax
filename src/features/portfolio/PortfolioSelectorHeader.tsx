import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { usePortfolio } from './usePortfolio';
import { PortfolioSelector } from './PortfolioSelector';

/**
 * Header left component: portfolio switcher + "Manage portfolios" that navigates to Portfolios screen.
 */
export function PortfolioSelectorHeader() {
  const navigation = useNavigation();
  const { portfolio, portfolios, switchPortfolio } = usePortfolio();
  const root = (navigation as { getParent?: () => { navigate: (name: string) => void } }).getParent?.();
  const navigateToPortfolios = () => root?.navigate('Portfolios');
  return (
    <PortfolioSelector
      currentPortfolio={portfolio}
      portfolios={portfolios}
      onSwitch={switchPortfolio}
      onManage={navigateToPortfolios}
    />
  );
}
