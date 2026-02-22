import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services';

interface User {
    id: string;
    email: string;
    name: string;
    role: string;
}

interface AuthContextType {
    isAuthenticated: boolean;
    user: User | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<boolean>;
    logout: () => void;
    updateProfile: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    // Validate existing token on mount
    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (token) {
            authService
                .getProfile()
                .then((profile) => {
                    setUser({
                        id: String(profile.id),
                        email: profile.email,
                        name: profile.name,
                        role: 'User',
                    });
                    setIsAuthenticated(true);
                })
                .catch(() => {
                    // Token invalid or expired — interceptor may handle refresh
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                })
                .finally(() => {
                    setLoading(false);
                });
        } else {
            setLoading(false);
        }
    }, []);

    const login = async (email: string, password: string): Promise<boolean> => {
        setLoading(true);
        try {
            const tokenData = await authService.login(email, password);
            localStorage.setItem('access_token', tokenData.access_token);
            localStorage.setItem('refresh_token', tokenData.refresh_token);

            const profile = await authService.getProfile();
            const userData: User = {
                id: String(profile.id),
                email: profile.email,
                name: profile.name,
                role: 'User',
            };

            setUser(userData);
            setIsAuthenticated(true);
            setLoading(false);
            return true;
        } catch {
            setLoading(false);
            return false;
        }
    };

    const logout = () => {
        setUser(null);
        setIsAuthenticated(false);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        navigate('/signin');
    };

    const updateProfile = (updates: Partial<User>) => {
        if (!user) return;
        setUser({ ...user, ...updates });
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, user, loading, login, logout, updateProfile }}>
            {children}
        </AuthContext.Provider>
    );
};
