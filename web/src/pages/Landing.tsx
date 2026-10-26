import { CallToAction } from '../components/landing/CallToAction';
import { DataFlowNote } from '../components/landing/DataFlowNote';
import { FeatureGrid } from '../components/landing/FeatureGrid';
import { Hero } from '../components/landing/Hero';
import { HowItWorks } from '../components/landing/HowItWorks';
import { useTitle } from '../hooks/useTitle';

export default function Landing() {
  useTitle('');
  return (
    <div className="landing">
      <Hero />
      <HowItWorks />
      <FeatureGrid />
      <DataFlowNote />
      <CallToAction />
    </div>
  );
}
