import { Route, type RouteDefinition } from './router';
import { HelpPage } from './pages/Help';
import { HomePage } from './pages/Home';

export const routes: RouteDefinition[] = [
  <Route path="/" element={<HomePage />} />,
  <Route path="/help" element={<HelpPage />} />,
];
