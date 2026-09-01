'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/mercado', label: 'Visão geral', exact: true },
  { href: '/mercado/produtos', label: 'Produtos' },
  { href: '/mercado/notas', label: 'Notas' },
  { href: '/mercado/nova', label: '+ Nova nota' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Seções do Mercado">
      {LINKS.map((l) => {
        const active = l.exact ? path === l.href : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? 'page' : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
