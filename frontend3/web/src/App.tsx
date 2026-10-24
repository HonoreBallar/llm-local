import { useState } from 'react';
import ChatWidget from './components/ChatWidget';
import CategoriesPage from './pages/CategoriesPage';
import FicheDetail from './pages/FicheDetail';
import FichesPage from './pages/FichesPage';
import { useHash } from './router';

export default function App() {
  const route = useHash();
  // Incrémenté quand le chatbot modifie la base : les pages se rechargent.
  const [version, setVersion] = useState(0);

  const parts = route.split('/').filter(Boolean);
  const section = parts[0] === 'fiches' ? 'fiches' : 'categories';

  let page;
  if (section === 'categories') page = <CategoriesPage version={version} />;
  else if (parts[1] === 'nouvelle' && (parts[2] === 'cni' || parts[2] === 'kyc'))
    page = <FicheDetail key={route} newType={parts[2]} version={version} />;
  else if (parts[1] && Number(parts[1]) > 0)
    page = <FicheDetail key={route} id={Number(parts[1])} version={version} />;
  else page = <FichesPage version={version} />;

  return (
    <>
      <nav className="topnav">
        <div className="topnav-inner">
          <span className="brand">Gestion</span>
          <a href="#/categories" className={section === 'categories' ? 'active' : ''}>
            Catégories
          </a>
          <a href="#/fiches" className={section === 'fiches' ? 'active' : ''}>
            Fiches
          </a>
        </div>
      </nav>
      <div className="page">{page}</div>
      <ChatWidget onDataChanged={() => setVersion((v) => v + 1)} />
    </>
  );
}
