import { createConfig, http } from 'wagmi';
import { mainnet, polygon } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

const connectors = projectId
  ? [injected(), walletConnect({ projectId })]
  : [injected()];

export const wagmiConfig = createConfig({
  chains: [polygon, mainnet],
  connectors,
  transports: {
    [polygon.id]: http(),
    [mainnet.id]: http(),
  },
});
