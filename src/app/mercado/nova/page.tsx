import NovaNota from '@/components/NovaNota';
import { hasVisionCredentials } from '@/lib/parse-receipt';

export const dynamic = 'force-dynamic';

export default function NovaNotaPage() {
  return (
    <>
      <h1>Nova nota</h1>
      <p className="page-sub">
        Tire a foto do cupom ou anexe uma imagem. O Cofrin lê os itens e você confere antes de salvar.
      </p>
      <NovaNota visionEnabled={hasVisionCredentials()} />
    </>
  );
}
