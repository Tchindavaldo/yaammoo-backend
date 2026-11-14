-- ============================================================================
-- 077 — Conditions d'utilisation et politique de confidentialité (texte en base)
-- ============================================================================
-- `legal_documents` : une ligne par version du texte. `requires_acceptance` :
-- true = modification importante, l'écran d'acceptation revient pour tous ;
-- false = modification mineure, simple signalement dans l'app.
-- `legal_acceptances` : preuve d'acceptation (qui, quelle version, quand).
-- Idempotente.
-- ============================================================================
CREATE TABLE IF NOT EXISTS legal_documents (
  version             INTEGER PRIMARY KEY,
  title               TEXT NOT NULL,
  content             TEXT NOT NULL,
  requires_acceptance BOOLEAN NOT NULL DEFAULT FALSE,
  published_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  version     INTEGER NOT NULL REFERENCES legal_documents(version),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  app_version TEXT,
  UNIQUE (user_id, version)
);
CREATE INDEX IF NOT EXISTS legal_acceptances_user_idx ON legal_acceptances (user_id, version DESC);
ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY;

INSERT INTO legal_documents (version, title, content, requires_acceptance, published_at)
VALUES (1, 'Conditions d''utilisation et confidentialité', $legal$CONDITIONS GÉNÉRALES D'UTILISATION ET POLITIQUE DE CONFIDENTIALITÉ DE YAAMMOO

Version 1 — Dernière mise à jour : 14 novembre 2026

Introduction

Bienvenue sur Yaammoo !

Les conditions de Yaammoo comprennent la présente introduction, les Conditions générales, les Définitions et règles d'interprétation, les Annexes et la Politique de confidentialité (ensemble, le « Contrat »). Le Contrat forme un accord juridique entre RAUVAL SARL, exploitant de Yaammoo (ci-après « Yaammoo », « nous », « notre » ou « nos »), et toute personne qui télécharge, installe, consulte ou utilise l'application mobile Yaammoo, ses services associés et tout contenu qui y est proposé (ensemble, le « Service »), qu'elle dispose ou non d'un Compte (ci-après « vous », « votre » ou l'« Utilisateur »).

Le Service est exploité par RAUVAL SARL, société à responsabilité limitée unipersonnelle (SARL U) au capital de 100 000 F CFA, immatriculée au Registre du Commerce et du Crédit Mobilier sous le numéro CM-NSI-02-2026-B13-00937 en date du 05/10/2026, numéro d'identifiant unique (NIU) M102619012427C, dont le siège social est situé à Ngousso, Yaoundé, Cameroun.

Pour toute question : +237 696 080 087 (téléphone et WhatsApp), support@yaammoo.rauval.com, site : yaammoo.rauval.com.

Sauf indication contraire, toute référence au Service vise l'ensemble des fonctionnalités de Yaammoo telles qu'elles sont décrites dans l'Application. Le Contrat fixe les conditions applicables à votre utilisation du Service. Les termes commençant par une majuscule ont le sens qui leur est donné dans la section « Définitions et interprétation ».

CONDITIONS GÉNÉRALES

Vous et Yaammoo convenez de ce qui suit :

1. Votre Compte Yaammoo

1.1. Éligibilité. Le Service est accessible à toute personne physique âgée d'au moins treize (13) ans, ainsi qu'aux personnes morales et entrepreneurs individuels qui souhaitent ouvrir une Boutique, par l'intermédiaire de leur Représentant.

1.2. Utilisateurs mineurs. L'Utilisateur âgé de treize (13) à dix-huit (18) ans déclare utiliser le Service avec l'accord de ses parents ou de son représentant légal. Le paiement des Commandes passées par un Utilisateur mineur est effectué au moyen d'un compte de paiement mobile appartenant à un adulte qui l'y autorise. Seule une personne majeure selon la loi camerounaise peut ouvrir une Boutique ou exercer comme Livreur.

1.3. Création du Compte. La création d'un Compte se fait au moyen d'un numéro de téléphone vérifié par un code envoyé par SMS. L'Utilisateur renseigne son nom et son prénom.

1.4. Exactitude des informations. L'Utilisateur s'engage à fournir des informations exactes, complètes et à jour, et à les modifier sans délai en cas de changement. Yaammoo peut vous demander à tout moment de confirmer ou de justifier les informations fournies.

1.5. Sécurité du Compte. L'Utilisateur est seul responsable de la confidentialité de son accès, de son téléphone et de la carte SIM associée à son numéro, ainsi que de toute activité réalisée depuis son Compte. Toute action effectuée depuis votre Compte est réputée avoir été effectuée par vous. Vous informez Yaammoo sans délai de toute perte de votre téléphone ou de votre carte SIM et de toute utilisation non autorisée de votre Compte.

1.6. Compte unique. Un même Utilisateur ne peut détenir qu'un seul Compte, sauf accord de Yaammoo.

1.7. Compte créé pour autrui. Vous ne devez pas créer ou tenter de créer un Compte pour le compte ou au nom d'un tiers, ni utiliser le numéro de téléphone d'un tiers sans son autorisation.

1.8. Type d'Utilisateur. Les présentes Conditions générales s'appliquent à tous les Utilisateurs. Lorsque vous ouvrez une Boutique ou exercez comme Livreur, l'Annexe correspondante s'applique automatiquement à vous, en plus des Conditions générales. Les Conditions générales et toute Annexe applicable se lisent ensemble comme un seul document. En cas de contradiction entre une stipulation des Conditions générales et une stipulation d'une Annexe applicable, la stipulation de l'Annexe prévaut.

1.9. Représentant. Lorsqu'une Boutique est ouverte pour une entreprise, la personne qui accepte le Contrat déclare et garantit :

• qu'elle est autorisée à ouvrir la Boutique au nom de l'entreprise et à l'engager au titre du Contrat ;
• qu'elle est autorisée à communiquer à Yaammoo, sous toute forme, les informations relatives aux numéros de retrait des gains de la Boutique ; et
• qu'elle est dirigeante de l'entreprise ou qu'elle exerce une responsabilité importante dans sa gestion. Yaammoo peut exiger tout document établissant ce pouvoir.

1.10. Entrepreneurs individuels. Si vous exploitez une Boutique en votre nom personnel, vous êtes personnellement responsable de votre utilisation du Service et de vos obligations envers les Clients et envers Yaammoo, y compris du paiement de toute somme due au titre du Contrat.

2. Entrée en vigueur et durée

2.1. Acceptation. Le Contrat prend effet à la date de son acceptation par l'Utilisateur. Cette acceptation est matérialisée par le fait de cocher la case prévue à cet effet lors de la création du Compte ou à l'affichage de l'écran d'acceptation. Il est expressément convenu que cette acceptation électronique vaut signature et a la même valeur qu'une signature manuscrite.

2.2. Enregistrement. La version du Contrat acceptée par chaque Utilisateur et la date de son acceptation sont enregistrées par Yaammoo.

2.3. Durée. Le Contrat est conclu pour une durée indéterminée. Il reste pleinement en vigueur jusqu'à sa résiliation par vous ou par Yaammoo dans les conditions de l'article 13.

2.4. Refus. L'Utilisateur qui n'accepte pas le Contrat doit s'abstenir d'utiliser le Service. Les Conditions applicables sont celles en vigueur au jour de l'utilisation.

3. Le Service

3.1. Objet. Les présentes Conditions générales ont pour objet de définir les modalités selon lesquelles Yaammoo met le Service à la disposition des Utilisateurs, ainsi que les droits et obligations de chacun.

3.2. Rôle de Yaammoo. Yaammoo agit comme plateforme de mise en relation entre Clients, Marchands et Livreurs, et comme intermédiaire d'encaissement des paiements pour le compte des Marchands. Le contrat de vente des plats, boissons et produits est conclu directement entre le Client et le Marchand. Yaammoo n'est ni le vendeur, ni le préparateur, ni le fabricant des produits proposés dans les Boutiques. Lorsque Yaammoo assure elle-même la livraison, elle agit en qualité de prestataire de livraison pour la seule Course concernée.

3.3. Encaissement pour le compte des Marchands. Yaammoo encaisse le prix des Commandes au nom et pour le compte des Marchands, par l'intermédiaire de Partenaires de paiement agréés. Le paiement effectué par le Client via le Service libère le Client de son obligation de payer le Marchand, à hauteur du montant payé.

3.4. Zone. Le Service est proposé au Cameroun, à Yaoundé dans un premier temps. D'autres villes pourront être ajoutées. La disponibilité d'une Boutique, d'un mode de remise ou d'une zone de livraison peut varier selon le lieu et l'heure.

3.5. Accès technique. L'accès au Service nécessite un appareil compatible et une connexion à Internet, dont les coûts restent à la charge de l'Utilisateur. Il vous appartient d'installer les mises à jour de l'Application ; certaines fonctions peuvent ne plus fonctionner sur une version ancienne.

3.6. Évolution du Service. Yaammoo peut faire évoluer le Service à tout moment, notamment ajouter, modifier ou retirer des fonctionnalités, des modes de paiement, des zones ou des modes de remise. En raison d'exigences réglementaires, de décisions d'une Autorité ou de contraintes imposées par les Opérateurs de paiement, Yaammoo peut devoir modifier la manière dont le Service est fourni, y compris retirer certaines fonctionnalités à certains Utilisateurs.

3.7. Vérifications. La mise à disposition d'un Compte ou d'une Boutique ne vaut pas confirmation que les vérifications de Yaammoo sont terminées. Yaammoo peut, à tout moment, procéder à des vérifications sur un Utilisateur, demander des informations ou documents complémentaires et limiter l'accès à certaines fonctions tant que ces vérifications ne sont pas satisfaites. Yaammoo informe l'Utilisateur concerné lorsque des vérifications n'ont pas abouti.

3.8. Licence d'utilisation. Sous réserve du respect du Contrat, Yaammoo vous concède un droit personnel, non exclusif, non transférable et révocable d'installer et d'utiliser l'Application sur les appareils que vous possédez ou contrôlez, pour vos seuls besoins d'utilisation du Service. Tous les droits qui ne vous sont pas expressément concédés sont réservés.

4. Commandes

4.1. Composition. Le Client compose sa Commande en choisissant un plat, éventuellement un format de prix, des extras et des boissons, ainsi qu'un mode de remise : livraison express (dès que la Commande est prête), livraison à une heure choisie, ou retrait sur place.

4.2. Informations des Boutiques. Les informations présentées dans les Boutiques (descriptions, photos, compositions, prix, disponibilités) sont fournies par les Marchands sous leur seule responsabilité. Les photos ont une valeur illustrative. Le Client qui présente une allergie, une intolérance ou un régime particulier vérifie la composition des produits auprès du Marchand avant de commander ; Yaammoo ne contrôle pas la composition des produits.

4.3. Panier. Le Panier regroupe les Commandes préparées et non encore payées. La présence d'un produit dans le Panier ne garantit ni sa disponibilité, ni son prix au moment du paiement.

4.4. Formation de la Commande. La Commande est définitivement passée lorsque le paiement est confirmé par l'Opérateur de paiement. Un récapitulatif est alors disponible dans le Compte.

4.5. Indisponibilité. Si un produit commandé devient indisponible après le paiement, le Marchand peut annuler la Commande dans les conditions de l'article 8.2.

5. Prix

5.1. Prix total. Le prix affiché au Client au moment de la validation est le prix total qu'il paie. Il comprend le prix du plat fixé par le Marchand, la rémunération de Yaammoo, les frais facturés par l'Opérateur de paiement et, en cas de livraison, le prix de la Course correspondant à la zone et au moment choisis.

5.2. Devise. Les prix sont exprimés en francs CFA (XAF), toutes taxes comprises le cas échéant.

5.3. Évolution des prix. Les prix peuvent évoluer à tout moment. Si un prix change entre la préparation de la Commande et son paiement, l'Application en informe le Client et lui présente le nouveau montant. Aucune somme n'est prélevée sans confirmation du Client.

5.4. Erreur manifeste. En cas d'erreur manifeste sur un prix affiché (par exemple un plat proposé à un prix sans rapport avec sa valeur réelle à la suite d'une erreur de saisie ou d'un incident technique), le Marchand ou Yaammoo peut annuler la Commande concernée. Le Client est alors remboursé en totalité.

6. Paiement

6.1. Moyens de paiement. Le paiement s'effectue par paiement mobile (Orange Money, MTN Mobile Money) via les Opérateurs de paiement partenaires de Yaammoo. Le Client confirme le paiement sur son téléphone selon la procédure de son opérateur.

6.2. Numéro de paiement. Le numéro utilisé pour le paiement peut être différent du numéro de contact pour la livraison. Lorsque le compte de paiement mobile utilisé n'est pas le vôtre, vous déclarez disposer de l'autorisation de son titulaire.

6.3. Code secret. Yaammoo n'a jamais accès au code secret du compte de paiement du Client. Yaammoo ne vous demandera jamais votre code secret, par quelque moyen que ce soit.

6.4. Échec du paiement. En cas d'échec, de refus ou d'abandon du paiement, la Commande n'est pas passée et reste, le cas échéant, dans le Panier.

6.5. Frais extérieurs au Service. Les frais éventuellement facturés directement par votre opérateur de téléphonie ou de paiement mobile, en dehors du prix affiché dans l'Application, restent à votre charge.

6.6. Paiements suspects. Yaammoo peut refuser, suspendre ou annuler un paiement ou une Commande lorsqu'elle a des raisons de penser qu'ils sont frauduleux, irréguliers ou contraires au Contrat. Dans ce cas, les sommes effectivement encaissées sont remboursées sur le numéro ayant servi au paiement, sauf instruction contraire d'une Autorité.

7. Livraison, regroupement et retrait

7.1. Délais. Les délais indiqués sont donnés à titre indicatif et dépendent notamment du temps de préparation, de la circulation et des conditions météorologiques. Un retard ne donne pas droit, à lui seul, à un remboursement.

7.2. Informations de livraison. Le Client indique un lieu, un numéro de contact et, s'il le souhaite, une note ou un message vocal. Il veille à ce que ces informations soient exactes et à être joignable au moment de la livraison.

7.3. Regroupement. Plusieurs Commandes d'un même Panier appartenant au même Départ ne donnent lieu qu'à une seule Course. De même, lorsqu'un Client commande à nouveau dans une Boutique pour un Départ qu'il a déjà payé et qui n'est pas encore parti en livraison, la nouvelle Commande rejoint ce Départ et la Course n'est pas facturée une seconde fois.

7.4. Retrait sur place. En cas de retrait sur place, le Client se présente à la Boutique au jour et à l'heure choisis, dans les horaires d'ouverture.

7.5. Client injoignable ou absent. Lorsque le Client est injoignable ou absent au lieu indiqué, le Livreur peut mettre fin à la livraison. La Commande est alors considérée comme livrée.

7.6. Réception. Le Client vérifie sa Commande au moment où elle lui est remise. La Commande est réputée livrée et conforme au moment de sa remise au Client, ou à toute personne qui la reçoit au lieu indiqué, sauf réclamation dans les conditions de l'article 8.7.

8. Annulation et remboursement

8.1. Annulation par le Client. Le Client peut annuler une Commande payée tant que le Marchand ne l'a pas acceptée. Il est remboursé du montant payé, diminué des frais de paiement réellement prélevés par l'Opérateur de paiement. Le montant remboursé et le numéro qui le recevra sont affichés avant la confirmation de l'annulation. Une fois la Commande acceptée par le Marchand, le Client ne peut plus l'annuler.

8.2. Annulation par le Marchand. Le Marchand peut annuler une Commande avant son départ en livraison. Le Client est alors remboursé en totalité.

8.3. Annulation automatique. Une Commande payée qui n'a pas été livrée dans un délai de sept (7) jours est annulée automatiquement et remboursée en totalité au Client.

8.4. Course partagée. Lorsqu'une Commande annulée partageait une Course avec d'autres Commandes encore en cours, le prix de la Course est remboursé lorsque toutes les Commandes du Départ ont été annulées.

8.5. Versement du remboursement. Le remboursement est envoyé sur le numéro de paiement mobile ayant servi au paiement. Le délai de réception dépend de l'Opérateur de paiement. En cas d'impossibilité technique, le remboursement est traité manuellement par Yaammoo. Aucun remboursement n'est effectué en espèces.

8.6. Commande livrée. Une Commande livrée n'est pas remboursable, sauf erreur manifeste imputable au Marchand ou au Service, examinée au cas par cas sur réclamation adressée au contact indiqué en introduction.

8.7. Délai de réclamation. Toute réclamation relative à une Commande (produit manquant, erroné ou impropre à la consommation) doit être adressée à Yaammoo dans un délai de quarante-huit (48) heures suivant la livraison ou l'heure de retrait prévue, accompagnée de tout élément utile (photos, description). Passé ce délai, la Commande est réputée acceptée sans réserve.

8.8. Abus. Yaammoo peut refuser une demande de remboursement et suspendre le Compte d'un Utilisateur en cas de réclamations abusives ou répétées, ou de tentative d'obtenir un remboursement indu.

9. Rémunération de Yaammoo et frais

9.1. Rémunération. Pour chaque Commande, Yaammoo perçoit une rémunération incluse dans le prix affiché au Client, conformément à l'article 5.1. Le Client ne paie aucun frais en dehors du prix affiché dans l'Application, sous réserve de l'article 6.5.

9.2. Frais des Marchands. Les éléments de rémunération et de frais applicables aux Marchands sont décrits à l'Annexe 1 et affichés dans l'Application.

9.3. Évolution. Yaammoo peut modifier sa rémunération à tout moment. Pour les Marchands et les Livreurs, toute hausse fait l'objet d'une information préalable d'au moins un (1) mois, précisant les changements appliqués.

9.4. Taxes. Chaque Utilisateur reste seul responsable des impôts, taxes et contributions dont il est redevable au titre de son activité. Lorsque la loi impose à Yaammoo de collecter ou de retenir un impôt ou une taxe, Yaammoo l'ajoute ou le déduit dans les conditions prévues par la loi.

10. Obligations de l'Utilisateur

10.1. L'Utilisateur s'engage à :

• utiliser le Service conformément à sa destination, au Contrat et aux lois en vigueur ;
• ne pas passer de fausses Commandes ni de Commandes qu'il n'entend pas recevoir ;
• ne pas utiliser de moyen de paiement dont il n'est pas titulaire ou pour lequel il n'a pas d'autorisation ;
• respecter les Marchands, Livreurs et équipes de Yaammoo, et s'abstenir de tout propos injurieux, menaçant ou discriminatoire ;
• ne pas tenter d'accéder sans autorisation aux systèmes, de perturber le fonctionnement du Service, ni d'en extraire massivement les contenus ;
• ne pas usurper l'identité d'un tiers ;
• coopérer avec Yaammoo pour toute question relative à une Commande, un paiement ou une réclamation.

10.2. L'Utilisateur s'interdit :

• de copier, modifier, reproduire, encadrer, republier, télécharger, afficher, transmettre ou distribuer tout ou partie de l'Application ou de ses logiciels, sous quelque forme et par quelque moyen que ce soit ;
• de décompiler, désassembler, procéder à l'ingénierie inverse ou tenter de toute autre manière d'accéder au code source de l'Application ;
• d'accéder à tout ou partie du Service dans le but de concevoir un produit ou un service concurrent ;
• d'utiliser des robots, scripts ou moyens automatisés pour accéder au Service, passer des Commandes ou collecter des données ;
• de concéder, vendre, louer, céder ou mettre à disposition d'un tiers son accès au Service ;
• d'introduire ou de permettre l'introduction de tout virus, code malveillant ou vulnérabilité dans les systèmes de Yaammoo ;
• de contourner ou tenter de contourner les mesures de sécurité, les limites techniques ou les règles de prix et de regroupement du Service.

11. Produits et usages interdits

11.1. Aucun produit ou service illicite, contraire aux lois applicables ou figurant dans la liste ci-dessous ne peut être proposé, vendu ou acheté via le Service :

• stupéfiants, drogues et substances psychotropes ;
• médicaments et produits de pharmacie ;
• armes, munitions et produits explosifs ;
• boissons alcoolisées et produits du tabac remis à des mineurs ;
• produits contrefaits ou piratés ;
• produits impropres à la consommation, périmés ou ne respectant pas les règles d'hygiène et de sécurité alimentaire ;
• produits dont la vente exige une licence ou une autorisation que le Marchand ne détient pas ;
• contenus à caractère sexuel ou pornographique ;
• tout produit ou service sans rapport avec l'activité de restauration et de livraison proposée par la Boutique, sauf accord de Yaammoo.

11.2. Le Service ne doit pas être utilisé pour transférer de l'argent entre personnes, pour obtenir des espèces, pour régler une dette sans rapport avec une Commande réelle ou pour dissimuler l'origine de fonds. Toute Commande fictive ou passée dans ce but est interdite.

12. Lutte contre la fraude, le blanchiment et la corruption

12.1. Contrôles. Yaammoo met en place les contrôles qu'elle estime nécessaires pour prévenir la fraude, le blanchiment de capitaux et le financement du terrorisme, et pour respecter ses obligations légales et celles de ses Partenaires de paiement.

12.2. Coopération. Sur demande, l'Utilisateur fournit à Yaammoo les informations et documents nécessaires à ces contrôles, dans le respect des lois applicables.

12.3. Mesures. Lorsque Yaammoo reçoit des instructions écrites d'une Autorité, ou lorsqu'elle estime qu'un Utilisateur est ou pourrait être impliqué dans une activité frauduleuse, Yaammoo peut :

• refuser l'accès d'un Utilisateur au Service ;
• suspendre temporairement l'accès d'un Utilisateur au Service ou à certaines fonctions, notamment les retraits ;
• mettre fin à l'accès d'un Utilisateur au Service ; et/ou
• retenir les sommes concernées ou les transférer selon les instructions de l'Autorité, vers le compte désigné par celle-ci.

12.4. Signalement. Yaammoo peut signaler aux Autorités compétentes et à ses Partenaires de paiement toute opération ou tout comportement suspect, sans être tenue d'en informer préalablement l'Utilisateur concerné lorsque la loi l'interdit.

12.5. Corruption. Il est interdit d'offrir, de promettre ou d'accorder à un membre des équipes de Yaammoo, directement ou indirectement, un avantage indu en vue d'obtenir un traitement de faveur. Toute sollicitation de cette nature doit être signalée à Yaammoo.

13. Durée, suspension et résiliation

13.1. Durée. Le Service est fourni à compter de l'acceptation du Contrat et pendant toute sa durée, jusqu'à sa résiliation conformément au présent article.

13.2. Résiliation par l'Utilisateur. L'Utilisateur peut supprimer son Compte à tout moment depuis Profil > Supprimer mon compte. Les Commandes en cours au moment de la suppression restent régies par le Contrat jusqu'à leur clôture.

13.3. Résiliation par Yaammoo avec préavis. Yaammoo peut résilier le Contrat avec tout Utilisateur à tout moment, sans avoir à en indiquer le motif, moyennant un préavis d'un (1) mois notifié par tout moyen prévu à l'article 25.

13.4. Suspension ou résiliation immédiate. Sans préjudice de ses autres droits, Yaammoo peut suspendre ou supprimer un Compte, une Boutique ou l'accès d'un Livreur, après avertissement sauf urgence, avec effet immédiat, notamment si l'Utilisateur :

• commet un manquement au Contrat et n'y remédie pas, lorsque ce manquement peut être corrigé, dans un délai de sept (7) jours après en avoir été informé ;
• commet ou tente de commettre une fraude, ou présente un risque pour les autres Utilisateurs, pour Yaammoo ou pour ses Partenaires de paiement ;
• a fourni des informations inexactes, incomplètes ou trompeuses, ou ne transmet pas les documents demandés ;
• propose ou achète un produit interdit par l'article 11 ;
• ne détient pas ou perd une licence, une autorisation ou un agrément nécessaire à son activité ;
• fait l'objet d'une procédure collective, cesse ses paiements ou cesse tout ou partie substantielle de son activité ;
• tient des propos ou adopte des comportements injurieux, menaçants, violents ou discriminatoires ;
• ou si une Autorité, un Opérateur de paiement ou un Partenaire de paiement l'exige.

13.5. Mesures provisoires. Pendant l'examen d'une situation, Yaammoo peut, à titre provisoire, masquer une Boutique, limiter certaines fonctions, bloquer les retraits ou suspendre l'accès au Compte, pendant la durée raisonnablement nécessaire à cet examen.

14. Conséquences de la résiliation

14.1. Sommes dues à Yaammoo. Lorsque le Contrat prend fin alors que des sommes restent dues à Yaammoo, notamment au titre d'un solde négatif du Portefeuille, ces sommes deviennent immédiatement exigibles. La suppression du Compte d'un Marchand ne libère pas celui-ci des sommes dues au titre d'un solde négatif.

14.2. Solde du Portefeuille. Lorsque le Contrat prend fin et qu'un solde positif figure au Portefeuille d'un Marchand ou d'un Livreur, Yaammoo verse ce solde au titulaire, sous réserve de ses droits au titre de l'article 15, dans un délai de quatorze (14) jours à compter de la date de fin du Contrat, sur le numéro de retrait enregistré.

14.3. Survie. À la fin du Contrat, les articles 14 (Conséquences de la résiliation), 15 (Compensation et rétention des sommes), 16 (Indemnisation), 17 (Confidentialité), 18 (Protection des données personnelles), 20 (Limitation de responsabilité), 21 (Propriété intellectuelle), 25 (Communications, notifications et preuve), 28 (Divisibilité) à 33 (Droit applicable et règlement des litiges) inclus, la section « Définitions et interprétation » et la Politique de confidentialité restent en vigueur.

14.4. Droits acquis. La fin du Contrat n'affecte pas les droits, recours, obligations ou responsabilités des parties nés avant la date de fin, y compris le droit de demander réparation de tout manquement survenu avant cette date.

15. Compensation et rétention des sommes

15.1. Compensation. Yaammoo peut compenser de plein droit toute somme due par un Marchand ou un Livreur au titre du Contrat (reprises, frais, remboursements, pénalités imposées par un Partenaire de paiement, sommes dues à la suite d'une fraude) avec les sommes figurant à son Portefeuille ou qui lui sont dues par Yaammoo.

15.2. Rétention. Yaammoo peut différer tout retrait ou tout versement dû à un Marchand ou à un Livreur, dans la mesure qu'elle estime nécessaire ou appropriée pour protéger sa capacité à recouvrer toute somme due ou toute dette, actuelle ou prévisible, liée au Contrat, notamment en cas de réclamations, d'annulations, de remboursements en cours ou de soupçon de fraude.

15.3. Autres droits. L'exercice par Yaammoo des droits prévus au présent article s'entend sans préjudice de tout autre droit ou recours dont elle dispose en vertu de la loi, du Contrat ou autrement.

16. Indemnisation

16.1. Par l'Utilisateur. L'Utilisateur indemnise Yaammoo, ses dirigeants, salariés et représentants de l'ensemble des demandes, actions, réclamations, procédures, condamnations, dommages, coûts et dépenses, y compris les amendes, pénalités, intérêts et frais raisonnables d'avocat et de conseil, ainsi que les impôts et taxes y afférents, subis par Yaammoo du fait d'un manquement de l'Utilisateur aux articles 1.9, 10 (Obligations de l'Utilisateur), 11 (Produits et usages interdits), 12 (Lutte contre la fraude, le blanchiment et la corruption), 17 (Confidentialité), 18 (Protection des données personnelles), 19 (Déclarations et garanties) ou 21 (Propriété intellectuelle), ou aux Annexes applicables.

16.2. Par Yaammoo. Sous réserve de l'article 20, Yaammoo indemnise le Marchand ou le Livreur des pertes qu'il subit du fait directement de la perte ou du détournement, par Yaammoo ou ses dirigeants, des sommes figurant à son Portefeuille.

17. Confidentialité

17.1. Informations confidentielles. Les Marchands et les Livreurs s'engagent à ne pas divulguer, à quelque moment que ce soit, les conditions qui leur sont proposées par Yaammoo, ni aucune information relative à Yaammoo ou à son activité, notamment ses services, systèmes, procédures, prix, rémunérations, Clients, partenaires, logiciels et Droits de propriété intellectuelle (les « Informations confidentielles »), sauf lorsque ces informations :

• sont ou deviennent publiques autrement que par un acte ou une omission de la partie qui les reçoit ;
• étaient légalement détenues par la partie qui les reçoit avant leur communication ;
• sont communiquées avec l'autorisation écrite de Yaammoo, dans les limites de cette autorisation ;
• sont communiquées légalement par un tiers sans restriction ; ou
• doivent être communiquées en vertu de la loi, d'une décision de justice ou d'une demande d'une Autorité.

17.2. Communication par Yaammoo. Yaammoo peut communiquer les conditions du Contrat et les informations relatives à un Utilisateur à ses Partenaires de paiement et aux Opérateurs de paiement, lorsque leurs règles de connaissance du client l'exigent, ainsi qu'à ses salariés, prestataires, conseils et sociétés liées qui en ont besoin pour l'exécution du Contrat, à charge pour eux de respecter une obligation de confidentialité équivalente.

17.3. Usage limité. Les Informations confidentielles ne peuvent être utilisées à aucune autre fin que l'exécution du Contrat.

18. Protection des données personnelles

18.1. Le traitement des Données personnelles dans le cadre du Service est régi par la Politique de confidentialité figurant en Partie 2, qui fait partie intégrante du Contrat. L'acceptation du Contrat emporte acceptation de la Politique de confidentialité.

18.2. Les Marchands et les Livreurs qui reçoivent des Données personnelles de Clients s'engagent à respecter la Politique de confidentialité, l'Annexe qui leur est applicable et la législation camerounaise relative à la protection des données à caractère personnel.

19. Déclarations et garanties

19.1. Chaque Utilisateur déclare et garantit :

• qu'il a la capacité juridique d'accepter le Contrat ou, s'il est mineur, qu'il agit avec l'accord de ses parents ou de son représentant légal ;
• que les informations qu'il fournit sont exactes, complètes et à jour ;
• qu'il utilise le Service pour son propre compte et non pour le compte d'un tiers non déclaré ;
• que l'acceptation et l'exécution du Contrat n'entraînent la violation d'aucun autre engagement qui le lie.

19.2. Le Marchand déclare et garantit en outre, pour lui-même, ses dirigeants et ses préposés :

• qu'il exerce son activité légalement et détient les licences, autorisations et agréments nécessaires, qu'il communique à Yaammoo dans un délai de deux (2) Jours ouvrés sur demande ;
• qu'il ne fait l'objet d'aucune condamnation, injonction ou décision pour fraude ou pratique trompeuse ;
• qu'il ne fait l'objet d'aucune procédure administrative, fiscale ou sanitaire de nature à l'empêcher d'exécuter ses obligations au titre du Contrat ;
• qu'il informe Yaammoo sans délai si l'une de ces déclarations cesse d'être exacte.

19.3. Yaammoo déclare qu'elle est régulièrement constituée et immatriculée au Cameroun et qu'elle dispose des pouvoirs nécessaires pour conclure et exécuter le Contrat.

20. Limitation de responsabilité

20.1. Portée. Les références à la responsabilité dans le présent article visent toute forme de responsabilité découlant du Contrat ou liée à celui-ci, qu'elle soit contractuelle, délictuelle ou autre.

20.2. Obligations de paiement. Rien dans le présent article ne limite les obligations de paiement d'un Marchand ou d'un Livreur au titre du Contrat.

20.3. Responsabilités non limitées. Rien dans le Contrat ne limite une responsabilité qui ne peut légalement être exclue ou limitée, notamment en cas de dommage corporel causé par une faute, de dol ou de faute lourde.

20.4. Rôle de Yaammoo. Yaammoo met en relation les Clients, Marchands et Livreurs et encaisse les paiements pour le compte des Marchands. La préparation, la qualité, la composition, l'hygiène et la conformité des produits relèvent de la seule responsabilité du Marchand.

20.5. Disponibilité du Service. Yaammoo met en œuvre les moyens raisonnables pour assurer l'accès et le bon fonctionnement du Service, sans garantir son caractère ininterrompu ou exempt d'erreurs. Yaammoo ne saurait être tenue responsable des interruptions dues aux réseaux mobiles, aux Opérateurs de paiement, aux Partenaires de paiement, aux fournisseurs d'hébergement, à la maintenance ou à un cas de force majeure.

20.6. Dommages indirects. Yaammoo, ses dirigeants, salariés et prestataires ne sont pas responsables des dommages indirects résultant de l'utilisation du Service ou liés au Contrat, notamment les pertes de bénéfices, de chiffre d'affaires, d'économies escomptées ou de clientèle.

20.7. Plafond. Sauf dans les cas visés à l'article 20.3, la responsabilité totale de Yaammoo ne peut excéder :

• envers un Client, le montant payé pour la Commande à l'origine du dommage ;
• envers un Marchand ou un Livreur, le montant de la rémunération perçue par Yaammoo sur ses Commandes au cours des six (6) mois précédant le fait générateur de la réclamation.

20.8. Délai de notification. Le délai pour notifier une réclamation contre Yaammoo commence le jour où l'Utilisateur a eu connaissance, ou aurait raisonnablement dû avoir connaissance, du fait générateur, et expire six (6) mois après cette date. La notification est faite par écrit et décrit le fait et les motifs de la réclamation de manière suffisamment détaillée. À défaut de notification dans ce délai, Yaammoo n'encourt aucune responsabilité au titre de ce fait. Le présent article ne remplace pas le délai de réclamation propre aux Commandes prévu à l'article 8.7.

21. Propriété intellectuelle

21.1. Droits de Yaammoo. L'Application, sa structure, ses textes, logos, graphismes, logiciels et bases de données sont la propriété de Yaammoo ou de ses partenaires et sont protégés par le droit de la propriété intellectuelle. Rien dans le Contrat ne constitue un transfert ou une cession de ces droits à l'Utilisateur.

21.2. Interdiction. Toute reproduction, représentation, adaptation ou exploitation non autorisée de tout ou partie du Service est interdite.

21.3. Contenus des Marchands. Le Marchand garantit disposer des droits sur les photos et contenus qu'il publie et concède à Yaammoo, pour la durée de leur publication, le droit de les afficher dans le Service et de les adapter techniquement (format, recadrage). Le Marchand garantit Yaammoo contre toute réclamation d'un tiers relative à ces contenus.

21.4. Suggestions. Les idées, remarques et suggestions que vous adressez à Yaammoo concernant le Service peuvent être librement utilisées par Yaammoo, sans contrepartie.

21.5. Signalement. L'Utilisateur informe Yaammoo sans délai de toute atteinte aux droits de Yaammoo dont il a connaissance.

22. Conditions propres aux boutiques d'applications

22.1. Apple. Lorsque vous avez obtenu l'Application sur l'App Store d'Apple, les stipulations suivantes s'appliquent :

• le Contrat est conclu entre vous et Yaammoo uniquement, et non avec Apple Inc. (« Apple ») ; Yaammoo, et non Apple, est seule responsable de l'Application et de son contenu ;
• le droit d'utilisation de l'Application est limité à une utilisation sur les appareils de marque Apple que vous possédez ou contrôlez, conformément aux règles d'utilisation fixées par les conditions de l'App Store ;
• Yaammoo est seule responsable de la maintenance et de l'assistance relatives à l'Application ; Apple n'a aucune obligation à ce titre ;
• si l'Application n'est pas conforme à une garantie applicable, vous pouvez en informer Apple, qui vous remboursera le prix d'achat éventuel de l'Application ; dans la mesure permise par la loi, Apple n'a aucune autre obligation de garantie relative à l'Application ;
• Yaammoo, et non Apple, est responsable du traitement de toute réclamation relative à l'Application, notamment en matière de responsabilité du fait des produits, de non-conformité à une réglementation, de protection des consommateurs ou de protection de la vie privée ;
• en cas de réclamation d'un tiers alléguant que l'Application porte atteinte à ses droits de propriété intellectuelle, Yaammoo, et non Apple, est responsable de l'enquête, de la défense, du règlement et de l'extinction de cette réclamation ;
• vous déclarez que vous ne vous trouvez pas dans un pays soumis à un embargo du gouvernement des États-Unis ou désigné par celui-ci comme soutenant le terrorisme, et que vous ne figurez sur aucune liste de personnes interdites ou faisant l'objet de restrictions établie par le gouvernement des États-Unis ;
• vous respectez les conditions des tiers applicables à votre utilisation de l'Application, notamment celles de votre opérateur de téléphonie ;
• Apple et ses filiales sont des tiers bénéficiaires du présent article et, dès votre acceptation du Contrat, Apple a le droit de s'en prévaloir à votre encontre.

22.2. Google. Lorsque vous avez obtenu l'Application sur Google Play, le Contrat est conclu entre vous et Yaammoo uniquement. Google n'est pas responsable de l'Application ni de son contenu, et votre utilisation de Google Play reste soumise aux conditions de Google.

22.3. Questions et réclamations. Toute question, réclamation ou demande relative à l'Application est adressée à Yaammoo, aux coordonnées indiquées en introduction.

23. Indépendance des parties

23.1. Rien dans le Contrat ne crée ni n'est réputé créer une société, une association, une entreprise commune, un mandat général ou une relation de travail entre Yaammoo et un Utilisateur. Yaammoo n'agit pour le compte des Marchands que pour l'encaissement des paiements, dans les conditions de l'article 3.3 et de l'Annexe 1.

23.2. Les Marchands et les Livreurs exercent leur activité en toute indépendance, sous leur propre responsabilité. Ils ne sont ni salariés, ni préposés, ni représentants de Yaammoo et ne peuvent engager Yaammoo à l'égard des tiers.

24. Force majeure

24.1. Définition. Constitue un Événement de force majeure toute circonstance échappant au contrôle raisonnable d'une partie, notamment :

• catastrophe naturelle, inondation, glissement de terrain, tempête ou fortes pluies ;
• épidémie ou pandémie ;
• émeutes, troubles civils, actes de terrorisme, guerre, conflit armé, sanctions ou embargo ;
• toute loi ou décision d'un gouvernement ou d'une Autorité, y compris la restriction ou la coupure de l'accès à Internet ou aux réseaux mobiles ;
• incendie, explosion, effondrement de bâtiment ou accident ;
• grève, conflit social ou blocage, autre que propre à la partie qui l'invoque ;
• défaillance d'un fournisseur, d'un prestataire technique, d'un hébergeur, d'un Partenaire de paiement ou d'un Opérateur de paiement ;
• interruption ou défaillance de la fourniture d'électricité, d'Internet ou des réseaux de télécommunication ;
• suspension, pour quelque raison que ce soit, des services de paiement mobile, des services bancaires ou des transferts de fonds, sauf lorsque cette suspension vise spécifiquement l'Utilisateur concerné.

24.2. Effets. La partie empêchée, gênée ou retardée dans l'exécution de ses obligations par un Événement de force majeure (la « Partie affectée ») n'est pas en manquement au Contrat et n'encourt aucune responsabilité de ce fait. Le délai d'exécution de ses obligations est prolongé d'autant. Les obligations correspondantes de l'autre partie sont suspendues dans la même mesure.

24.3. Notification. La Partie affectée informe l'autre partie, dès que raisonnablement possible et au plus tard dans un délai de sept (7) jours à compter de son début, de l'Événement de force majeure, de sa date de début, de sa durée probable et de ses effets sur l'exécution de ses obligations. Elle met en œuvre tous les efforts raisonnables pour en limiter les effets.

24.4. Résiliation. Si l'Événement de force majeure empêche, gêne ou retarde l'exécution des obligations de la Partie affectée pendant une période continue de plus de quatre (4) semaines, l'autre partie peut résilier le Contrat moyennant un préavis de trente (30) jours.

25. Communications, notifications et preuve

25.1. Notifications de Yaammoo. Yaammoo vous adresse ses notifications par notification dans l'Application, par SMS, par WhatsApp, par appel ou par courrier électronique, aux coordonnées associées à votre Compte. Vous vous engagez à maintenir ces coordonnées à jour.

25.2. Notifications de l'Utilisateur. Toute notification destinée à Yaammoo est adressée par écrit à support@yaammoo.rauval.com ou par WhatsApp au +237 696 080 087.

25.3. Date de réception. Une notification est réputée reçue au moment de son envoi. Lorsqu'elle est envoyée en dehors des heures ouvrables (de 8 h à 18 h un Jour ouvré, heure de Yaoundé), elle est réputée reçue à 8 h le Jour ouvré suivant. Pour prouver l'envoi d'un courrier électronique, il suffit d'établir qu'il a été correctement adressé et que l'expéditeur n'a pas reçu de message automatique d'échec de distribution dans les vingt-quatre (24) heures.

25.4. Convention de preuve. Les parties conviennent que les données enregistrées dans les systèmes de Yaammoo et de ses prestataires, notamment les dates et heures d'acceptation, les Commandes, les confirmations des Opérateurs de paiement, les statuts de livraison, les notifications et les opérations du Portefeuille, font foi entre elles et constituent une preuve recevable, sauf preuve contraire. L'écrit électronique a la même valeur probante que l'écrit sur support papier.

25.5. Procédures judiciaires. Les significations d'actes de procédure ne peuvent pas être faites par courrier électronique.

26. Modification du Contrat

26.1. Yaammoo peut modifier le Contrat et la Politique de confidentialité, notamment pour tenir compte de l'évolution du Service ou de la réglementation.

26.2. Les modifications mineures sont signalées dans l'Application. L'utilisation du Service après la date d'entrée en vigueur d'une modification mineure vaut acceptation de celle-ci.

26.3. En cas de modification importante (nouveaux frais, nouvelles catégories de données collectées, nouvelles obligations des Marchands), l'acceptation de l'Utilisateur lui est de nouveau demandée. L'Utilisateur qui refuse la nouvelle version ne peut plus utiliser le Service et peut supprimer son Compte.

27. Cession

27.1. L'Utilisateur ne peut céder, transférer, nantir, sous-traiter ou transmettre de quelque manière que ce soit tout ou partie de ses droits et obligations au titre du Contrat sans l'accord écrit préalable de Yaammoo.

27.2. Yaammoo peut céder ou transférer tout ou partie du Contrat à toute société contrôlée par RAUVAL SARL ou placée sous un contrôle commun avec elle, ou à tout acquéreur de tout ou partie de l'activité Yaammoo. L'Utilisateur en est informé par tout moyen.

28. Divisibilité

28.1. Si une stipulation du Contrat est ou devient nulle, illicite ou inapplicable, elle est réputée modifiée dans la mesure minimale nécessaire pour la rendre valable. Si cette modification n'est pas possible, la stipulation est réputée supprimée. La modification ou la suppression d'une stipulation n'affecte pas la validité et l'applicabilité du reste du Contrat.

28.2. Les parties s'efforcent alors de remplacer la stipulation concernée par une stipulation valable qui atteint, dans toute la mesure du possible, le résultat recherché par la stipulation d'origine.

29. Droits des tiers

Sous réserve de l'article 22.1 au bénéfice d'Apple, aucune personne qui n'est pas partie au Contrat ne peut se prévaloir d'un droit ou d'un avantage au titre de celui-ci.

30. Intégralité du Contrat

30.1. Le Contrat, avec les documents auxquels il renvoie, constitue l'intégralité de l'accord entre les parties concernant son objet. Il remplace et annule tous échanges, correspondances, négociations, projets, accords, promesses, assurances, garanties, déclarations et arrangements antérieurs, écrits ou oraux, relatifs à cet objet.

30.2. Chaque partie reconnaît qu'en acceptant le Contrat, elle ne se fonde sur aucune déclaration, assurance ou garantie qui n'y figure pas.

30.3. Rien dans le présent article ne limite ou n'exclut une responsabilité pour dol ou fraude.

31. Renonciation

31.1. La renonciation à un droit ou à un recours prévu par le Contrat ou par la loi n'est valable que si elle est faite par écrit. Elle ne vaut que pour les circonstances pour lesquelles elle est donnée et n'emporte pas renonciation pour un manquement ultérieur.

31.2. Le fait pour une partie de ne pas exercer, ou d'exercer tardivement ou partiellement, un droit ou un recours ne vaut pas renonciation à ce droit ou à tout autre droit, et n'empêche ni ne limite son exercice ultérieur.

32. Langue

Le Contrat est rédigé en français. En cas de traduction, seule la version française fait foi.

33. Droit applicable et règlement des litiges

33.1. Droit applicable. Le Contrat, ainsi que tout litige ou réclamation né du Contrat ou lié à celui-ci, à son objet ou à sa formation, y compris les litiges non contractuels, est régi par le droit camerounais, notamment les Actes uniformes de l'OHADA applicables.

33.2. Règlement amiable. En cas de différend, les parties recherchent d'abord une solution amiable. L'Utilisateur adresse une réclamation écrite au contact indiqué en introduction, en décrivant précisément le différend. Yaammoo s'efforce d'y répondre dans un délai de trente (30) jours.

33.3. Juridiction. À défaut d'accord amiable dans un délai de trente (30) jours à compter de la réclamation, les tribunaux de Yaoundé sont seuls compétents.

33.4. Mesures urgentes. Le présent article ne fait pas obstacle au droit de chaque partie de solliciter du juge compétent des mesures conservatoires ou urgentes lorsque la situation présente un risque immédiat et important pour elle.

Définitions et interprétation

Dans le Contrat, sauf si le contexte impose un autre sens, les termes suivants ont la signification indiquée ci-dessous :

« Annexe » désigne chacune des annexes des Conditions générales, à savoir l'Annexe 1 (Marchands), l'Annexe 2 (Livreurs) et l'Annexe 3 (Formulaire d'adhésion du Marchand) ;

« Application » désigne l'application mobile Yaammoo, disponible sur les boutiques d'applications Android et iOS, dans toutes ses versions et mises à jour ;

« Autorité » désigne toute administration, juridiction, autorité de régulation ou de contrôle, ou tout autre organisme public disposant d'un pouvoir de contrôle ou de décision sur Yaammoo, sur un Utilisateur ou sur un Opérateur de paiement ;

« Boutique » désigne l'espace de l'Application géré par un Marchand, présentant ses plats, prix, horaires, zones et tarifs de livraison ;

« Client » désigne l'Utilisateur qui passe une Commande auprès d'un Marchand ;

« Commande » désigne la demande d'achat d'un ou plusieurs produits passée par un Client auprès d'un Marchand et réglée via l'Application ;

« Compte » désigne l'espace personnel de l'Utilisateur, accessible après authentification par numéro de téléphone ;

« Conditions » ou « Conditions générales » désigne la présente partie du Contrat intitulée « Conditions générales » ;

« Contrat » a le sens qui lui est donné dans l'Introduction ;

« Course » désigne la prestation de livraison d'une ou plusieurs Commandes vers un même lieu, à un même moment, depuis une même Boutique ;

« Départ » désigne l'ensemble des Commandes d'un même Client, d'une même Boutique, pour une même zone, un même type de livraison et un même moment ;

« Données personnelles » désigne toute information se rapportant à une personne physique identifiée ou identifiable ;

« Droits de propriété intellectuelle » désigne les droits d'auteur et droits voisins, marques, noms commerciaux, noms de domaine, dessins et modèles, droits sur les logiciels et les bases de données, savoir-faire et secrets d'affaires, ainsi que tous droits similaires, enregistrés ou non, en tout pays ;

« Événement de force majeure » a le sens qui lui est donné à l'article 24.1 ;

« Jour ouvré » désigne un jour, du lundi au vendredi, qui n'est pas un jour férié au Cameroun ;

« Livreur » désigne la personne qui assure l'acheminement d'une Commande, qu'il s'agisse du Marchand lui-même, d'une personne qu'il désigne ou d'un livreur mis à disposition par Yaammoo ;

« Lois applicables » désigne l'ensemble des lois, règlements, Actes uniformes de l'OHADA, règlements de la CEMAC, décisions de justice et décisions des Autorités applicables aux parties ;

« Marchand » ou « Restaurant » désigne le professionnel ou le particulier qui propose, via une Boutique, des plats, boissons ou produits à la vente dans l'Application ;

« Opérateur de paiement » désigne tout prestataire tiers de paiement mobile (notamment Orange Money et MTN Mobile Money) et ses intermédiaires techniques ;

« Panier » désigne l'ensemble des Commandes préparées par le Client et non encore payées ;

« Partenaires de paiement » désigne les prestataires techniques et établissements agréés par l'intermédiaire desquels Yaammoo collecte, conserve et reverse les paiements, notamment pawaPay et MobileWallet ;

« Politique » ou « Politique de confidentialité » désigne la Partie 2 du Contrat ;

« Portefeuille » désigne le solde du Marchand ou du Livreur tenu par Yaammoo, alimenté par les Commandes et diminué par les retraits et les reprises ;

« Prix réel » désigne le prix du plat librement fixé par le Marchand, avant ajout de la rémunération de Yaammoo et des frais de paiement ;

« Représentant » désigne le dirigeant ou la personne autorisée à agir au nom d'une entreprise et à l'engager au titre du Contrat ;

« Reprise » désigne le débit, sur le Portefeuille, de sommes précédemment créditées, notamment à la suite d'une annulation ou d'un remboursement ;

« Service » a le sens qui lui est donné dans l'Introduction ;

« Utilisateur » désigne toute personne qui télécharge, installe, consulte ou utilise l'Application, qu'elle dispose ou non d'un Compte ;

« Yaammoo » désigne RAUVAL SARL, en sa qualité d'exploitant du Service.

Règles d'interprétation. Les titres des articles sont donnés pour la commodité de lecture et n'ont pas de valeur interprétative. Les mots « notamment », « y compris » et « en particulier » introduisent des exemples et ne limitent pas la portée des termes qui les précèdent. Le singulier inclut le pluriel et inversement. Sauf mention contraire, les délais sont exprimés en jours calendaires et les heures s'entendent de l'heure de Yaoundé.

ANNEXE 1 — CONDITIONS PARTICULIÈRES APPLICABLES AUX MARCHANDS

La présente Annexe s'applique à tout Utilisateur qui crée une Boutique. En créant une Boutique, le Marchand accepte, en plus des Conditions générales, les stipulations suivantes. La présente Annexe se lit avec les Conditions générales ; pour tout point qu'elle ne traite pas, les Conditions générales s'appliquent.

1. Ouverture de la Boutique et vérifications

1.1. La Boutique est ouverte au nom du Marchand. Les numéros de retrait des gains doivent appartenir au Marchand ou à son Représentant.

1.2. Le Marchand identifie son activité et fournit à Yaammoo, dans un délai de sept (7) jours à compter de l'ouverture de sa Boutique ou de la demande de Yaammoo, les documents permettant de vérifier son identité et son activité, notamment une pièce d'identité du Marchand ou de son Représentant et, s'il s'agit d'une entreprise, son immatriculation au Registre du Commerce et du Crédit Mobilier, son numéro d'identifiant unique et les pièces d'identité de ses dirigeants.

1.3. Le Marchand fournit tout autre document demandé par Yaammoo dans un délai de trois (3) Jours ouvrés. À défaut, Yaammoo peut masquer ou fermer la Boutique et résilier le Contrat avec effet immédiat.

1.4. Le Marchand accepte que ces documents et les informations relatives à sa Boutique (identité, activité, date d'ouverture, volumes d'encaissement et de retrait) soient communiqués aux Partenaires de paiement et aux Opérateurs de paiement, y compris dans le cadre de rapports périodiques, lorsque leurs règles l'exigent.

1.5. Lorsque l'activité du Marchand est soumise à une licence ou à une autorisation, le Marchand en transmet une copie à Yaammoo avant toute vente. À défaut, Yaammoo peut fermer la Boutique avec effet immédiat.

2. Informations publiées

Le Marchand publie des informations exactes et à jour : plats, compositions, prix, photos, horaires, zones et tarifs de livraison. Il met à jour la disponibilité de ses plats et de ses stocks. Il indique, lorsque c'est pertinent, les ingrédients susceptibles de provoquer des allergies.

3. Prix réel et prix affiché

Le Marchand fixe librement son Prix réel. Le prix affiché au Client y ajoute la rémunération de Yaammoo et les frais de paiement. Le Marchand perçoit son Prix réel, ainsi que le prix de la Course lorsqu'il livre lui-même, et une provision destinée à couvrir les frais de retrait en espèces.

4. Livraison assurée par Yaammoo

Lorsque Yaammoo assure la livraison pour une Boutique, le prix de la Course est perçu par Yaammoo et le Livreur, et non par le Marchand.

5. Mandat d'encaissement

5.1. Le Marchand donne mandat à Yaammoo, qui l'accepte, d'encaisser en son nom et pour son compte le prix des Commandes payées par les Clients via le Service, par l'intermédiaire des Partenaires de paiement.

5.2. Le paiement reçu par Yaammoo vaut paiement au Marchand et libère le Client à hauteur du montant payé.

5.3. Yaammoo déduit des sommes encaissées sa rémunération, les frais de paiement et, le cas échéant, le prix de la Course qui ne revient pas au Marchand, avant de créditer le Portefeuille.

6. Portefeuille

6.1. Nature. Le Portefeuille est un relevé des sommes dues au Marchand. Il ne constitue ni un compte bancaire, ni un compte de paiement, ni de la monnaie électronique, et ne produit pas d'intérêts. Les fonds correspondants sont collectés et conservés par l'intermédiaire des Partenaires de paiement.

6.2. Crédit. Le montant dû au Marchand est crédité sur son Portefeuille dès la confirmation du paiement de la Commande.

6.3. Retraits. Le Marchand retire son solde vers son compte Orange Money ou MTN Mobile Money. Le montant et les éventuels frais de chaque retrait sont affichés avant sa confirmation. Les frais facturés par les Opérateurs de paiement pour les retraits sont à la charge du Marchand.

6.4. Frais de vérification des numéros de retrait. La validation des numéros Orange Money et MTN Mobile Money de la Boutique se fait par un code de vérification envoyé par SMS. Le coût de chaque code envoyé est mis à la charge du Marchand et débité de son Portefeuille ; il est indiqué avant l'envoi. Le solde peut donc être négatif avant la première Commande. Ce solde négatif ne bloque pas la Boutique : il est repris sur les premiers gains.

6.5. Conséquences d'une annulation :

• en cas d'annulation par le Client, les sommes créditées au Marchand pour la Commande annulée sont reprises sur son Portefeuille ;
• en cas d'annulation par le Marchand, les sommes créditées pour la Commande sont reprises et les frais de paiement réellement prélevés par l'Opérateur de paiement sont mis à la charge du Marchand ;
• l'annulation automatique prévue à l'article 8.3 des Conditions générales produit les mêmes effets qu'une annulation par le Marchand.

6.6. Solde négatif. Les reprises peuvent rendre le solde du Portefeuille négatif. Tant que le solde est négatif à la suite d'un remboursement, la Boutique ne reçoit plus de nouvelles Commandes. Un solde négatif dû aux seuls frais de vérification de l'article 6.4 de la présente Annexe n'entraîne pas ce blocage. Le Marchand en est averti par notification à chaque tentative de Commande. Le solde négatif est apuré par les gains ultérieurs ou par un règlement convenu avec Yaammoo.

6.7. Compensation et rétention. Les droits de compensation et de rétention prévus à l'article 15 des Conditions générales s'appliquent au Portefeuille.

7. Qualité et hygiène

Le Marchand est seul responsable de la préparation, de la qualité, de l'hygiène, de l'étiquetage, de la conformité sanitaire et de la sécurité des produits qu'il vend, ainsi que du respect de la réglementation applicable à son activité. Il remet les Commandes dans un emballage adapté au transport.

8. Données des Clients et non-contournement

8.1. Le Marchand n'utilise les données des Clients (nom, téléphone, lieu de livraison) que pour préparer et livrer la Commande concernée. Toute autre utilisation, notamment commerciale, est interdite.

8.2. Le Marchand s'interdit de solliciter un Client rencontré via le Service pour conclure, en dehors du Service, une Commande qui aurait dû être passée via le Service, dans le but d'éviter la rémunération de Yaammoo.

9. Obligations fiscales et comptables

9.1. Le Marchand est seul redevable des impôts, taxes et contributions dus au titre de ses ventes, notamment l'impôt sur le revenu ou sur les sociétés, la contribution des patentes ou l'impôt libératoire et, le cas échéant, la taxe sur la valeur ajoutée.

9.2. Yaammoo met à la disposition du Marchand, dans l'Application, l'historique de ses Commandes et des opérations de son Portefeuille.

10. Coopération

10.1. Le Marchand répond à toute demande de Yaammoo relative à une fraude ou à une suspicion de fraude au plus tard un (1) Jour ouvré après sa réception.

10.2. Le Marchand informe Yaammoo, dans un délai de sept (7) jours, de tout changement de son activité, de ses licences ou autorisations, de son Représentant ou de ses numéros de retrait.

11. Suspension

Yaammoo peut suspendre ou masquer une Boutique en cas d'informations inexactes, de plaintes répétées, de non-respect du Contrat ou de solde négatif.

12. Fermeture de la Boutique

Le Marchand peut fermer sa Boutique à tout moment. Les Commandes payées avant la fermeture doivent être honorées ou annulées dans les conditions des Conditions générales. Le solde du Portefeuille est réglé conformément à l'article 14 des Conditions générales.

ANNEXE 2 — CONDITIONS PARTICULIÈRES APPLICABLES AUX LIVREURS

La présente Annexe s'applique à toute personne qui assure des livraisons via le Service. Elle se lit avec les Conditions générales ; pour tout point qu'elle ne traite pas, les Conditions générales s'appliquent.

1. Prise en charge et livraison

1.1. Le Livreur s'engage à prendre en charge la Commande telle qu'elle lui est remise et à la livrer avec soin au lieu indiqué.

1.2. Il met à jour le statut de la livraison dans l'Application.

1.3. Il ne demande au Client aucune somme en plus du prix payé via le Service.

2. Données des Clients

Le Livreur n'utilise les données du Client que pour la livraison en cours et ne les conserve pas. Il s'interdit de contacter le Client à d'autres fins.

3. Rémunération

3.1. La rémunération du Livreur est créditée sur son Portefeuille dans les conditions affichées dans l'Application.

3.2. Les stipulations de l'Annexe 1 relatives à la nature du Portefeuille, aux retraits et aux reprises, ainsi que l'article 15 des Conditions générales, s'appliquent au Portefeuille du Livreur.

4. Indépendance et sécurité

4.1. Le Livreur exerce son activité en toute indépendance, conformément à l'article 23 des Conditions générales. Il organise librement son activité et peut refuser une Course.

4.2. Il est seul responsable de son moyen de transport, de son entretien, des permis, assurances et autorisations nécessaires, ainsi que du respect du code de la route.

4.3. Il est responsable de la Commande depuis sa prise en charge jusqu'à sa remise au Client.

5. Désactivation

Yaammoo peut suspendre ou désactiver l'accès d'un Livreur dans les conditions de l'article 13 des Conditions générales, notamment en cas de plaintes répétées, de comportement inapproprié ou de non-respect de la présente Annexe.

ANNEXE 3 — FORMULAIRE D'ADHÉSION DU MARCHAND

Yaammoo encaisse les paiements des Commandes par l'intermédiaire de Partenaires de paiement agréés, notamment pawaPay, qui proposent des services d'agrégation de paiement mobile en Afrique.

En validant la création de sa Boutique, le Marchand confirme qu'il a lu, compris et accepté d'être lié par les Conditions générales, l'Annexe 1 et, dans la mesure où elles lui sont applicables, les conditions des Partenaires de paiement de Yaammoo. Cette validation électronique vaut signature.

Lors de la validation, les informations suivantes sont enregistrées par Yaammoo et forment le présent formulaire :

• nom et prénom du Marchand ou de son Représentant ;
• qualité du Représentant (gérant, directeur, propriétaire) ;
• nom de la Boutique ;
• dénomination légale de l'entreprise, le cas échéant ;
• adresse de la Boutique ;
• secteur d'activité : restauration et vente de produits alimentaires ;
• date et heure de la validation.

Le Marchand vérifie l'exactitude de ces informations avant la validation et les met à jour dans l'Application en cas de changement.

PARTIE 2 — POLITIQUE DE CONFIDENTIALITÉ

La présente Politique de confidentialité explique quelles Données personnelles Yaammoo collecte lorsque vous utilisez le Service, pourquoi elle les collecte, avec qui elle les partage, combien de temps elle les conserve et comment vous pouvez exercer vos droits. Elle fait partie intégrante du Contrat. Les termes commençant par une majuscule ont le sens qui leur est donné dans la section « Définitions et interprétation » des Conditions générales.

1. Responsable du traitement

1.1. Le responsable du traitement des Données personnelles est RAUVAL SARL, représentée par TCHINDA TCHENETSU Valdo Blair, gérant, dont le siège social est situé à Ngousso, Yaoundé, Cameroun.

1.2. Contact pour toute question relative aux Données personnelles : +237 696 080 087 (téléphone et WhatsApp), support@yaammoo.rauval.com.

1.3. La présente Politique est établie conformément à la législation camerounaise relative à la protection des données à caractère personnel, notamment la loi n° 2024/017 du 23 décembre 2024 relative à la protection des données à caractère personnel.

2. Champ d'application

2.1. La présente Politique s'applique à tous les Utilisateurs : Clients, Marchands, Livreurs et visiteurs de l'Application.

2.2. Elle s'applique également aux personnes dont les données nous sont communiquées par un Utilisateur, notamment le destinataire d'une livraison dont le numéro est indiqué comme numéro de contact, ou le titulaire du compte de paiement mobile utilisé pour payer une Commande.

3. Données collectées

3.1. Données que vous fournissez :

• identité : nom, prénom ;
• coordonnées : numéro de téléphone, adresse électronique le cas échéant ;
• livraison : lieu, adresse, note écrite, message vocal, numéro de contact ;
• Boutique (Marchands) : nom, photos, plats, prix, horaires, zones, numéro de retrait des gains ;
• vérifications (Marchands, Livreurs) : pièces d'identité et documents d'immatriculation demandés en application des Conditions générales ;
• échanges avec le support.

3.2. Données générées par l'utilisation :

• Commandes : contenu, montants, dates, statuts, annulations, remboursements ;
• paiements : numéro de paiement mobile, opérateur, références de transaction (jamais le code secret) ;
• Portefeuille (Marchands, Livreurs) : crédits, retraits, reprises ;
• acceptation du Contrat : version acceptée, date et heure ;
• notifications : identifiant technique de l'appareil pour les notifications.

3.3. Données de localisation : avec votre autorisation, la position de l'appareil pour proposer un lieu de livraison et, pour les Livreurs, pour le suivi de la livraison. Vous pouvez retirer cette autorisation dans les réglages du téléphone.

3.4. Données techniques : modèle et système de l'appareil, version de l'Application, journaux d'erreurs et rapports de plantage, données de navigation dans l'Application (écrans consultés, durée des sessions).

3.5. Données reçues de tiers :

• des Opérateurs de paiement et des Partenaires de paiement : statut du paiement ou du remboursement, références de transaction, nom associé au compte de paiement mobile lorsque l'opérateur le communique ;
• des Marchands et des Livreurs : statuts de préparation et de livraison de vos Commandes ;
• de notre prestataire d'authentification : confirmation de la vérification de votre numéro de téléphone.

3.6. Données que nous ne collectons pas : Yaammoo ne collecte pas le code secret de votre compte de paiement mobile, ni le contenu de vos contacts, de vos SMS ou de vos appels.

4. Autorisations de l'appareil

L'Application peut vous demander les autorisations suivantes, que vous pouvez accepter ou refuser, puis modifier à tout moment dans les réglages de votre téléphone :

• localisation : pour proposer un lieu de livraison et, pour les Livreurs, pour le suivi de la livraison ;
• notifications : pour vous informer de l'état de vos Commandes, paiements et remboursements ;
• microphone : uniquement lorsque vous enregistrez un message vocal de livraison ;
• photos et appareil photo : pour permettre aux Marchands d'ajouter des photos à leur Boutique.

Le refus d'une autorisation peut rendre la fonction concernée indisponible, sans empêcher l'utilisation du reste du Service.

5. Finalités et bases légales

Nous traitons vos Données personnelles pour les finalités suivantes, sur les bases indiquées :

• créer et gérer le Compte, vous authentifier — exécution du contrat ;
• passer, payer, livrer, annuler et rembourser les Commandes — exécution du contrat ;
• créditer et verser les gains des Marchands et Livreurs — exécution du contrat ;
• vérifier l'identité et l'activité des Marchands et des Livreurs — obligation légale et intérêt légitime ;
• tenir la comptabilité — obligation légale ;
• répondre aux demandes des Autorités et des Partenaires de paiement — obligation légale ;
• prévenir la fraude, sécuriser le Service — intérêt légitime ;
• corriger les erreurs et améliorer l'Application — intérêt légitime ;
• traiter vos réclamations et demandes au support — exécution du contrat ;
• envoyer les notifications liées à vos Commandes — exécution du contrat ;
• conserver la preuve de votre acceptation du Contrat — obligation légale et intérêt légitime ;
• utiliser votre position — consentement.

6. Consentement

6.1. En cochant la case relative à la Politique de confidentialité, vous consentez aux traitements décrits dans la présente Politique, dans la mesure où ils reposent sur votre consentement.

6.2. Vous pouvez retirer votre consentement à tout moment, notamment en désactivant la localisation dans les réglages de votre téléphone ou en écrivant au contact de l'article 1. Le retrait du consentement ne remet pas en cause les traitements effectués avant ce retrait.

7. Destinataires

7.1. Marchands et Livreurs : le nom, le téléphone et les informations de livraison sont communiqués au Marchand et au Livreur de la Commande, pour cette Commande uniquement.

7.2. Prestataires techniques, agissant sur instruction de Yaammoo et uniquement pour faire fonctionner le Service :

• pawaPay et MobileWallet : traitement des paiements et remboursements ;
• Supabase : hébergement de la base de données ;
• Firebase (Google) : authentification, notifications, stockage des images ;
• Bird : envoi des SMS de vérification ;
• Sentry : collecte des rapports de plantage ;
• Google Maps, Apple Maps et OpenRouteService : affichage des cartes et calcul des itinéraires.

7.3. Opérateurs de paiement : les données nécessaires à l'exécution des paiements, des remboursements et des retraits sont transmises à Orange Money et à MTN Mobile Money.

7.4. Partenaires de paiement (Marchands) : les informations et documents de vérification des Marchands sont communiqués aux Partenaires de paiement lorsque leurs règles de connaissance du client l'exigent.

7.5. Autorités : sur réquisition légale.

7.6. Opérations sur l'entreprise : en cas de transfert de tout ou partie de l'activité Yaammoo à une société liée à RAUVAL SARL ou à un repreneur, les Données personnelles peuvent être transmises au nouvel exploitant, qui sera tenu de respecter la présente Politique.

7.7. Yaammoo ne vend, ne loue et ne cède pas vos Données personnelles à des tiers.

8. Transferts hors du Cameroun

8.1. Certains prestataires hébergent des données hors du Cameroun. Yaammoo choisit des prestataires offrant des garanties de sécurité et de confidentialité, et limite les données transmises à ce qui est nécessaire.

8.2. Ces transferts sont effectués dans les conditions prévues par la législation camerounaise relative à la protection des données à caractère personnel.

9. Durées de conservation

• Compte actif : pendant toute la durée d'utilisation.
• Compte supprimé : effacement des Données personnelles sous 30 jours.
• Commandes, paiements et pièces comptables : 10 ans (obligation comptable OHADA), détachés de votre identité lorsque c'est possible.
• Documents de vérification des Marchands et des Livreurs : pendant la durée de la relation, puis pendant la durée exigée par la loi ou par les règles des Partenaires de paiement.
• Notes et messages vocaux de livraison : le temps nécessaire à la livraison et au traitement d'une éventuelle réclamation.
• Preuve de l'acceptation du Contrat : pendant la durée de la relation, puis pendant le délai de prescription applicable.
• Journaux techniques et rapports de plantage : durée limitée nécessaire au diagnostic.

À l'issue de ces durées, les données sont supprimées ou rendues anonymes.

10. Vos droits

10.1. Vous disposez d'un droit d'accès, de rectification, d'effacement, d'opposition et de limitation du traitement de vos Données personnelles, ainsi que du droit de retirer votre consentement à tout moment pour les traitements qui en dépendent, et, lorsque la loi le prévoit, du droit à la portabilité de vos données.

10.2. Le droit d'effacement ne s'applique pas aux données que Yaammoo doit conserver pour respecter une obligation légale, notamment comptable, ou pour la constatation, l'exercice ou la défense de ses droits en justice.

11. Exercice de vos droits

11.1. Vous pouvez supprimer votre Compte depuis Profil > Supprimer mon compte, ou exercer vos droits en écrivant au contact de l'article 1.

11.2. Une réponse vous est apportée sous 30 jours. Une preuve d'identité peut être demandée.

11.3. L'exercice de vos droits est gratuit. Yaammoo peut toutefois refuser les demandes manifestement infondées ou excessives, notamment par leur caractère répétitif.

11.4. Vous pouvez saisir l'Autorité de protection des données à caractère personnel si vous estimez que vos droits ne sont pas respectés.

12. Sécurité

Yaammoo met en œuvre des mesures techniques et organisationnelles adaptées : authentification des accès, chiffrement des échanges, restriction des accès aux seules personnes et services qui en ont besoin, journalisation des opérations sensibles. Les personnes et prestataires qui accèdent aux Données personnelles sont tenus à une obligation de confidentialité.

13. Violation de données

Aucun système n'étant infaillible, Yaammoo s'engage à informer les personnes concernées et l'autorité compétente en cas de violation de données présentant un risque, dans les conditions et délais prévus par la loi.

14. Mineurs

14.1. Le Service est accessible dès 13 ans. Entre 13 et 18 ans, l'Utilisateur l'utilise avec l'accord de ses parents ou de son représentant légal, qui peut demander l'accès aux données ou la suppression du Compte au contact de l'article 1.

14.2. Yaammoo ne collecte pas plus de données sur un Utilisateur mineur que celles nécessaires au fonctionnement du Service et n'adresse pas de communications promotionnelles incitant les mineurs à acheter.

15. Données de tiers que vous nous communiquez

Lorsque vous indiquez le numéro de contact d'une autre personne pour une livraison, ou que vous payez avec le compte de paiement mobile d'un tiers, vous déclarez avoir informé cette personne et disposer de son accord. Cette personne peut exercer ses droits auprès de Yaammoo dans les conditions de l'article 11.

16. Notifications et communications

Les notifications liées aux Commandes (paiement, préparation, livraison, annulation, remboursement) sont nécessaires au Service. Les éventuelles communications promotionnelles des Boutiques peuvent être désactivées dans les réglages de notification du téléphone.

17. Modification de la Politique

La Politique peut évoluer dans les conditions de l'article 26 des Conditions générales. La date de la dernière mise à jour figure en tête du document.
$legal$, TRUE, '2026-11-14T00:00:00Z')
ON CONFLICT (version) DO NOTHING;
