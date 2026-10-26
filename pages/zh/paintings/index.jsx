import { PaintingIndex } from '../../../components/PaintingSite';
import { getPaintingPages } from '../../../lib/paintingPages';

export function getStaticProps() {
  return { props: { paintings: getPaintingPages() } };
}

export default function Paintings({ paintings }) {
  return <PaintingIndex lang="zh" paintings={paintings} />;
}
