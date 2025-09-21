// ========================================
// SYSTÈME INDEXEDDB POUR BAMBOO
// Gestion des soldes et transactions
// ========================================

class BambooDatabase {
    constructor() {
        this.dbName = 'BambooDB';
        this.version = 1;
        this.db = null;
    }

    // Initialisation de la base de données
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('Erreur lors de l\'ouverture de la base de données');
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('Base de données IndexedDB initialisée avec succès');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Store pour les comptes
                if (!db.objectStoreNames.contains('comptes')) {
                    const comptesStore = db.createObjectStore('comptes', { keyPath: 'id', autoIncrement: true });
                    comptesStore.createIndex('numero', 'numero', { unique: true });
                    comptesStore.createIndex('type', 'type', { unique: false });
                    comptesStore.createIndex('utilisateur', 'utilisateur', { unique: false });
                }

                // Store pour les transactions
                if (!db.objectStoreNames.contains('transactions')) {
                    const transactionsStore = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
                    transactionsStore.createIndex('compteId', 'compteId', { unique: false });
                    transactionsStore.createIndex('type', 'type', { unique: false });
                    transactionsStore.createIndex('date', 'date', { unique: false });
                    transactionsStore.createIndex('montant', 'montant', { unique: false });
                }

                // Store pour les utilisateurs
                if (!db.objectStoreNames.contains('utilisateurs')) {
                    const utilisateursStore = db.createObjectStore('utilisateurs', { keyPath: 'id', autoIncrement: true });
                    utilisateursStore.createIndex('email', 'email', { unique: true });
                    utilisateursStore.createIndex('telephone', 'telephone', { unique: true });
                }

                // Store pour les paramètres système
                if (!db.objectStoreNames.contains('parametres')) {
                    const parametresStore = db.createObjectStore('parametres', { keyPath: 'cle' });
                }

                console.log('Structure de base de données créée');
            };
        });
    }

    // ========================================
    // GESTION DES COMPTES
    // ========================================

    async ajouterCompte(compte) {
        const transaction = this.db.transaction(['comptes'], 'readwrite');
        const store = transaction.objectStore('comptes');
        
        const compteData = {
            numero: compte.numero,
            type: compte.type, // 'courant', 'epargne', 'business'
            solde: compte.solde || 0,
            devise: compte.devise || 'FCFA',
            utilisateur: compte.utilisateur,
            dateCreation: new Date(),
            statut: 'actif',
            limite: compte.limite || 0,
            description: compte.description || ''
        };

        return new Promise((resolve, reject) => {
            const request = store.add(compteData);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async obtenirComptes() {
        const transaction = this.db.transaction(['comptes'], 'readonly');
        const store = transaction.objectStore('comptes');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async obtenirCompteParId(id) {
        const transaction = this.db.transaction(['comptes'], 'readonly');
        const store = transaction.objectStore('comptes');
        
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async mettreAJourSolde(compteId, nouveauSolde) {
        const transaction = this.db.transaction(['comptes'], 'readwrite');
        const store = transaction.objectStore('comptes');
        
        return new Promise((resolve, reject) => {
            const getRequest = store.get(compteId);
            getRequest.onsuccess = () => {
                const compte = getRequest.result;
                if (compte) {
                    compte.solde = nouveauSolde;
                    compte.dateModification = new Date();
                    
                    const updateRequest = store.put(compte);
                    updateRequest.onsuccess = () => resolve(compte);
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    reject(new Error('Compte non trouvé'));
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    // ========================================
    // GESTION DES TRANSACTIONS
    // ========================================

    async ajouterTransaction(transaction) {
        const dbTransaction = this.db.transaction(['transactions', 'comptes'], 'readwrite');
        const transactionStore = dbTransaction.objectStore('transactions');
        const comptesStore = dbTransaction.objectStore('comptes');
        
        const transactionData = {
            compteId: transaction.compteId,
            type: transaction.type, // 'depot', 'retrait', 'virement', 'paiement'
            montant: transaction.montant,
            devise: transaction.devise || 'FCFA',
            description: transaction.description || '',
            date: new Date(),
            statut: 'complete',
            reference: transaction.reference || this.genererReference(),
            frais: transaction.frais || 0,
            beneficiaire: transaction.beneficiaire || null,
            categorie: transaction.categorie || 'general'
        };

        return new Promise((resolve, reject) => {
            // Ajouter la transaction
            const addRequest = transactionStore.add(transactionData);
            
            addRequest.onsuccess = () => {
                // Mettre à jour le solde du compte
                const getCompteRequest = comptesStore.get(transaction.compteId);
                getCompteRequest.onsuccess = () => {
                    const compte = getCompteRequest.result;
                    if (compte) {
                        if (transaction.type === 'depot' || transaction.type === 'virement_entrant') {
                            compte.solde += transaction.montant;
                        } else if (transaction.type === 'retrait' || transaction.type === 'virement_sortant') {
                            compte.solde -= transaction.montant;
                        }
                        
                        const updateRequest = comptesStore.put(compte);
                        updateRequest.onsuccess = () => resolve(transactionData);
                        updateRequest.onerror = () => reject(updateRequest.error);
                    } else {
                        reject(new Error('Compte non trouvé'));
                    }
                };
                getCompteRequest.onerror = () => reject(getCompteRequest.error);
            };
            
            addRequest.onerror = () => reject(addRequest.error);
        });
    }

    async obtenirTransactions(compteId = null, limite = 50) {
        const transaction = this.db.transaction(['transactions'], 'readonly');
        const store = transaction.objectStore('transactions');
        
        return new Promise((resolve, reject) => {
            let request;
            if (compteId) {
                const index = store.index('compteId');
                request = index.getAll(compteId);
            } else {
                request = store.getAll();
            }
            
            request.onsuccess = () => {
                const transactions = request.result
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .slice(0, limite);
                resolve(transactions);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async obtenirTransactionsParPeriode(debut, fin) {
        const transaction = this.db.transaction(['transactions'], 'readonly');
        const store = transaction.objectStore('transactions');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const transactions = request.result.filter(t => {
                    const dateTransaction = new Date(t.date);
                    return dateTransaction >= debut && dateTransaction <= fin;
                }).sort((a, b) => new Date(b.date) - new Date(a.date));
                resolve(transactions);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ========================================
    // GESTION DES UTILISATEURS
    // ========================================

    async ajouterUtilisateur(utilisateur) {
        const transaction = this.db.transaction(['utilisateurs'], 'readwrite');
        const store = transaction.objectStore('utilisateurs');
        
        const utilisateurData = {
            nom: utilisateur.nom,
            prenom: utilisateur.prenom,
            email: utilisateur.email,
            telephone: utilisateur.telephone,
            dateCreation: new Date(),
            statut: 'actif',
            role: utilisateur.role || 'client',
            adresse: utilisateur.adresse || '',
            ville: utilisateur.ville || '',
            pays: utilisateur.pays || 'Côte d\'Ivoire'
        };

        return new Promise((resolve, reject) => {
            const request = store.add(utilisateurData);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async obtenirUtilisateurs() {
        const transaction = this.db.transaction(['utilisateurs'], 'readonly');
        const store = transaction.objectStore('utilisateurs');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ========================================
    // STATISTIQUES ET RAPPORTS
    // ========================================

    async obtenirStatistiques() {
        const comptes = await this.obtenirComptes();
        const transactions = await this.obtenirTransactions();
        
        const totalSolde = comptes.reduce((sum, compte) => sum + compte.solde, 0);
        const totalTransactions = transactions.length;
        
        const transactionsParType = transactions.reduce((acc, t) => {
            acc[t.type] = (acc[t.type] || 0) + 1;
            return acc;
        }, {});

        const montantParType = transactions.reduce((acc, t) => {
            acc[t.type] = (acc[t.type] || 0) + t.montant;
            return acc;
        }, {});

        return {
            totalSolde,
            totalTransactions,
            nombreComptes: comptes.length,
            transactionsParType,
            montantParType,
            derniereTransaction: transactions[0] || null
        };
    }

    // ========================================
    // UTILITAIRES
    // ========================================

    genererReference() {
        return 'BAM' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
    }

    async viderBase() {
        const transaction = this.db.transaction(['comptes', 'transactions', 'utilisateurs', 'parametres'], 'readwrite');
        
        const promises = [
            transaction.objectStore('comptes').clear(),
            transaction.objectStore('transactions').clear(),
            transaction.objectStore('utilisateurs').clear(),
            transaction.objectStore('parametres').clear()
        ];

        return Promise.all(promises);
    }

    // ========================================
    // DONNÉES DE DÉMONSTRATION
    // ========================================

    async initialiserDonneesDemo() {
        try {
            // Vérifier si des données existent déjà
            const comptes = await this.obtenirComptes();
            console.log('🔍 Comptes existants:', comptes.length);
            
            // Vérifier si on a déjà les comptes nécessaires
            const hasCourant = comptes.some(c => c.type === 'courant');
            const hasEpargne = comptes.some(c => c.type === 'epargne');
            const hasInterets = comptes.some(c => c.type === 'interets');
            const hasInteretsFuturs = comptes.some(c => c.type === 'interets_futurs');
            
            if (hasCourant && hasEpargne && hasInterets && hasInteretsFuturs) {
                console.log('Données de démonstration complètes déjà présentes');
                return;
            }
            
            console.log('🔄 Création des comptes manquants...');

            // Créer seulement les comptes manquants
            if (!hasCourant) {
                console.log('➕ Création compte courant...');
                await this.ajouterCompte({
                    numero: '5532763277827',
                    type: 'courant',
                    solde: 1950000,
                    devise: 'FCFA',
                    utilisateur: 'EYENG ASSOUMOU',
                    description: 'Compte Courant principal'
                });
            }

            if (!hasEpargne) {
                console.log('➕ Création compte épargne...');
                await this.ajouterCompte({
                    numero: '00325890101',
                    type: 'epargne',
                    solde: 1990000,
                    devise: 'FCFA',
                    utilisateur: 'EYENG ASSOUMOU',
                    description: 'Compte Épargne principal'
                });
            }

            if (!hasInterets) {
                console.log('➕ Création compte intérêts...');
                await this.ajouterCompte({
                    numero: '00325890102',
                    type: 'interets',
                    solde: 198000,
                    devise: 'FCFA',
                    utilisateur: 'EYENG ASSOUMOU',
                    description: 'Intérêts Épargne acquis'
                });
            }

            if (!hasInteretsFuturs) {
                console.log('➕ Création compte intérêts futurs...');
                await this.ajouterCompte({
                    numero: '00325890103',
                    type: 'interets_futurs',
                    solde: 160000,
                    devise: 'FCFA',
                    utilisateur: 'EYENG ASSOUMOU',
                    description: 'Intérêts à venir'
                });
            }

            // Créer l'utilisateur principal
            await this.ajouterUtilisateur({
                nom: 'ASSOUMOU',
                prenom: 'EYENG',
                email: 'OTSIGroupe@gmail.com',
                telephone: '+241 01 23 45 67',
                role: 'client'
            });

            // Créer des transactions de démonstration réalistes
            const compteEpargne = await this.obtenirCompteParId(1);
            const compteInterets = await this.obtenirCompteParId(2);

            if (compteEpargne) {
                await this.ajouterTransaction({
                    compteId: compteEpargne.id,
                    type: 'depot',
                    montant: 1500000,
                    description: 'Dépôt initial épargne',
                    categorie: 'epargne'
                });

                await this.ajouterTransaction({
                    compteId: compteEpargne.id,
                    type: 'depot',
                    montant: 490000,
                    description: 'Dépôt mensuel épargne',
                    categorie: 'epargne'
                });

                await this.ajouterTransaction({
                    compteId: compteEpargne.id,
                    type: 'virement_entrant',
                    montant: 150000,
                    description: 'Virement reçu de MARTIN KOUAME',
                    categorie: 'virement'
                });

                await this.ajouterTransaction({
                    compteId: compteEpargne.id,
                    type: 'retrait',
                    montant: 50000,
                    description: 'Retrait GAB Libreville Centre',
                    categorie: 'retrait'
                });

                await this.ajouterTransaction({
                    compteId: compteEpargne.id,
                    type: 'paiement',
                    montant: 25000,
                    description: 'Paiement carte SUPERMARCHÉ CARREFOUR',
                    categorie: 'paiement'
                });

                await this.ajouterTransaction({
                    compteId: compteEpargne.id,
                    type: 'paiement',
                    montant: 5000,
                    description: 'Recharge mobile Libreville Telecom',
                    categorie: 'telecom'
                });

                await this.ajouterTransaction({
                    compteId: compteEpargne.id,
                    type: 'virement_entrant',
                    montant: 500000,
                    description: 'Virement reçu de SOCIÉTÉ ABC SARL',
                    categorie: 'virement'
                });
            }

            if (compteInterets) {
                await this.ajouterTransaction({
                    compteId: compteInterets.id,
                    type: 'depot',
                    montant: 198000,
                    description: 'Calcul intérêts mensuels',
                    categorie: 'interets'
                });
            }

            console.log('Données de démonstration initialisées avec succès');
        } catch (error) {
            console.error('Erreur lors de l\'initialisation des données de démonstration:', error);
        }
    }
}

// Instance globale de la base de données
const bambooDB = new BambooDatabase();

// Export pour utilisation dans d'autres fichiers
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BambooDatabase;
}
