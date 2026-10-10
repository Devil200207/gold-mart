import { env } from '../../config/env';
import { MockGateway } from './mock-gateway';
import { PaymentGateway } from './payment-gateway';

export type { PaymentGateway, WebhookEvent } from './payment-gateway';
export { SIGNATURE_HEADER } from './payment-gateway';

export const mockGateway = new MockGateway(env.MOCK_GATEWAY_SECRET);
export const gateway: PaymentGateway = mockGateway;
