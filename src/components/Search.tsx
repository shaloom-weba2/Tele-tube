import React, { useState, useEffect } from 'react';
import { Search as SearchIcon, User as UserIcon, X } from 'lucide-react';
import { db, collection, query, where, getDocs, limit } from '../lib/firebase';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';

interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
}

export default function UserSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSearch = searchParams.get('q') || '';
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [results, setResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialSearch !== searchTerm) {
      setSearchTerm(initialSearch);
    }
  }, [initialSearch]);

  useEffect(() => {
    const searchUsers = async () => {
      if (searchTerm.trim().length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const searchTerms = new Set([
          searchTerm.trim(),
          searchTerm.trim().toLowerCase(),
          searchTerm.trim().charAt(0).toUpperCase() + searchTerm.trim().slice(1).toLowerCase(),
          searchTerm.trim().toUpperCase()
        ]);

        const queries = Array.from(searchTerms).map(term => 
          query(
            collection(db, 'users'),
            where('displayName', '>=', term),
            where('displayName', '<=', term + '\uf8ff'),
            limit(10)
          )
        );

        const snapshots = await Promise.all(queries.map(q => getDocs(q)));
        const resultsMap = new Map();
        
        snapshots.forEach(snap => {
          snap.docs.forEach(doc => {
            resultsMap.set(doc.id, { uid: doc.id, ...doc.data() });
          });
        });

        setResults(Array.from(resultsMap.values()).slice(0, 20) as UserProfile[]);
      } catch (error) {
        console.error("Error searching users:", error);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(searchUsers, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    setSearchParams(value ? { q: value } : {});
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="relative mb-8">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <SearchIcon className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-11 pr-4 py-3 border border-gray-200 rounded-2xl leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all sm:text-sm"
          placeholder="Search for people..."
          value={searchTerm}
          onChange={handleSearchChange}
          autoFocus
        />
        {searchTerm && (
          <button
            onClick={() => {
              setSearchTerm('');
              setSearchParams({});
            }}
            className="absolute inset-y-0 right-0 pr-4 flex items-center"
          >
            <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-600"></div>
          </div>
        ) : results.length > 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid gap-4"
          >
            {results.map((user) => (
              <Link
                key={user.uid}
                to={`/profile/${user.uid}`}
                className="flex items-center gap-4 p-4 rounded-2xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100"
              >
                <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <UserIcon className="w-6 h-6" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 truncate">{user.displayName}</h3>
                  {user.bio && <p className="text-sm text-gray-500 truncate">{user.bio}</p>}
                </div>
              </Link>
            ))}
          </motion.div>
        ) : searchTerm.trim().length >= 2 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-medium">No users found for "{searchTerm}"</p>
            <p className="text-sm">Try searching for a different name.</p>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <SearchIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>Start typing to search for users</p>
          </div>
        )}
      </div>
    </div>
  );
}
