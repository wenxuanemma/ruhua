import { PaintingDetail } from '../../../components/PaintingSite';
import { getPaintingPages, getPaintingPage } from '../../../lib/paintingPages';

export function getStaticPaths() {
  return {
    paths: getPaintingPages().map(p => ({ params: { slug: p.slug } })),
    fallback: false,
  };
}

export function getStaticProps({ params }) {
  return { props: { painting: getPaintingPage(params.slug) } };
}

export default function Painting({ painting }) {
  return <PaintingDetail lang="zh" painting={painting} />;
}
