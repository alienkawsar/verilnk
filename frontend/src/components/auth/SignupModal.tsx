import React, { useState } from 'react';
import Image from 'next/image';
import { X, Mail, Globe, Loader2, AlertCircle, Building2, Phone, MapPin } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { signupSchema } from '@/lib/validation';
import { signupOrganization, fetchCountries } from '@/lib/api';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import PasswordFields from '@/components/auth/PasswordFields';
import { validatePassword } from '@/lib/passwordPolicy';

interface SignupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSwitchToLogin: () => void;
    defaultType?: SignupType;
}

type SignupType = 'INDIVIDUAL' | 'ORGANIZATION';
type SignupCountryOption = { id: string; name: string; code?: string | null };

const signupSelectClass =
    'w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800/40 disabled:text-slate-400 transition-colors [color-scheme:light] dark:[color-scheme:dark]';

const signupSelectOptionClass = 'bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100';

const isGlobalCountry = (country: SignupCountryOption | undefined): boolean => {
    if (!country) return false;
    const code = String(country.code || '').trim().toUpperCase();
    const name = String(country.name || '').trim().toUpperCase();
    return code === 'GL' || code === 'WW' || name === 'GLOBAL';
};

export default function SignupModal({ isOpen, onClose, onSwitchToLogin, defaultType = 'INDIVIDUAL' }: SignupModalProps) {
    const [signupType, setSignupType] = useState<SignupType>(defaultType);
    const { executeRecaptcha } = useGoogleReCaptcha();

    // Individual Form State
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        country: ''
    });

    // Organization Form State
    const [orgData, setOrgData] = useState({
        orgName: '',
        email: '',
        password: '',
        confirmPassword: '',
        website: '',
        phone: '',
        address: '',
        countryId: '', // Requires ID
        stateId: '',
        categoryId: '',
        type: 'PUBLIC',
        about: '',
        logo: ''
    });

    // Common State
    const [errors, setErrors] = useState<any>({});
    const [loading, setLoading] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
    const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
    const [uploadedLogoUrl, setUploadedLogoUrl] = useState<string | null>(null);
    const [generalError, setGeneralError] = useState('');
    // Lookups
    const [countries, setCountries] = useState<SignupCountryOption[]>([]);
    const [states, setStates] = useState<{ id: string, name: string }[]>([]);
    const [categories, setCategories] = useState<{ id: string, name: string }[]>([]);
    const [fetchingStates, setFetchingStates] = useState(false);

    const { login } = useAuth();

    React.useEffect(() => {
        if (isOpen) {
            setSignupType(defaultType);
        }
    }, [isOpen, defaultType]);

    // Fetch initial data
    React.useEffect(() => {
        if (isOpen) {
            fetchCountries().then(setCountries).catch(console.error);
            import('@/lib/api').then(mod => {
                if (mod.fetchCategories) mod.fetchCategories().then(setCategories).catch(console.error);
            });
        }
    }, [isOpen]);

    // Fetch states when Country changes
    React.useEffect(() => {
        if (signupType === 'ORGANIZATION' && orgData.countryId) {
            const selectedCountry = countries.find((country) => country.id === orgData.countryId);
            if (isGlobalCountry(selectedCountry)) {
                if (orgData.stateId) {
                    setOrgData((prev) => ({ ...prev, stateId: '' }));
                }
                setStates([]);
                return;
            }

            setFetchingStates(true);
            import('@/lib/api').then(mod => {
                if (mod.fetchStates) {
                    mod.fetchStates(orgData.countryId).then(setStates).catch(() => setStates([]));
                }
            }).finally(() => setFetchingStates(false));
        } else {
            setStates([]);
        }
    }, [orgData.countryId, orgData.stateId, signupType, countries]);

    React.useEffect(() => {
        if (signupType !== 'INDIVIDUAL') return;
        const selectedCountry = countries.find((country) => country.id === formData.country);
        if (isGlobalCountry(selectedCountry)) {
            setFormData((prev) => ({ ...prev, country: '' }));
        }
    }, [signupType, formData.country, countries]);

    // Validation Wrappers
    const validateIndividualField = (name: string, value: string) => {
        try {
            if (signupSchema.shape[name as keyof typeof signupSchema.shape]) {
                signupSchema.shape[name as keyof typeof signupSchema.shape].parse(value);
                setErrors((prev: any) => ({ ...prev, [name]: undefined }));
            }
        } catch (e: any) {
            setErrors((prev: any) => ({ ...prev, [name]: e.errors?.[0]?.message }));
        }
    };

    const handleIndividualChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (signupSchema.shape[name as keyof typeof signupSchema.shape]) {
            validateIndividualField(name, value);
        } else {
            setErrors((prev: any) => ({ ...prev, [name]: undefined }));
        }
    };

    const handleOrgChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setOrgData(prev => ({ ...prev, [name]: value }));
        setErrors((prev: any) => ({ ...prev, [name]: undefined }));
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isValidType = /\.(jpg|jpeg|png|webp|svg)$/i.test(file.name) || file.type.startsWith('image/');

        if (!isValidType) {
            setErrors((prev: any) => ({ ...prev, logo: 'Invalid file type (png/jpg/jpeg/webp' + (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg') ? '/svg' : '') + ')' }));
            return;
        }

        if (file.size > 1 * 1024 * 1024) {
            setErrors((prev: any) => ({ ...prev, logo: 'File too large (max 1MB)' }));
            return;
        }

        setSelectedLogoFile(file);
        setLogoPreviewUrl(URL.createObjectURL(file));
        setUploadingLogo(true);
        setErrors((prev: any) => ({ ...prev, logo: undefined }));

        try {
            const api = await import('@/lib/api');
            const res = await api.uploadPublicOrgLogo(file);
            const finalUrl = res.path || res.url;
            setUploadedLogoUrl(finalUrl);
            setOrgData(prev => ({ ...prev, logo: finalUrl }));
        } catch (error) {
            console.error('Logo upload failed', error);
            setErrors((prev: any) => ({ ...prev, logo: 'Failed to upload logo' }));
        } finally {
            setUploadingLogo(false);
        }
    };

    React.useEffect(() => {
        return () => {
            if (logoPreviewUrl) {
                URL.revokeObjectURL(logoPreviewUrl);
            }
        };
    }, [logoPreviewUrl]);

    const handleRemoveLogo = () => {
        if (logoPreviewUrl) {
            URL.revokeObjectURL(logoPreviewUrl);
        }
        setSelectedLogoFile(null);
        setLogoPreviewUrl(null);
        setUploadedLogoUrl(null);
        setOrgData(prev => ({ ...prev, logo: '' }));
        setErrors((prev: any) => ({ ...prev, logo: undefined }));
    };

    const handleIndividualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setGeneralError('');

        // Check Captcha (only if configured)
        const recaptchaEnabled = Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY);
        let captchaValue = undefined;
        let captchaAction = undefined;
        if (recaptchaEnabled) {
            if (!executeRecaptcha) {
                setGeneralError('Security check initializing, please wait...');
                return;
            }
            captchaValue = await executeRecaptcha('user_signup');
            captchaAction = 'user_signup';
            if (!captchaValue) {
                setGeneralError('Security check failed. Please try again.');
                return;
            }
        }

        const result = signupSchema.safeParse(formData);
        if (!result.success) {
            const newErrors: any = {};

            result.error.issues.forEach(issue => newErrors[issue.path[0]] = issue.message);
            setErrors(newErrors);
            return;
        }

        if (!formData.confirmPassword) {
            setErrors((prev: any) => ({ ...prev, confirmPassword: 'Confirm password is required' }));
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setErrors((prev: any) => ({ ...prev, confirmPassword: 'Passwords do not match' }));
            return;
        }

        if (!formData.country) {
            setErrors((prev: any) => ({ ...prev, country: "Country is required" }));
            return;
        }

        const selectedCountry = countries.find((country) => country.id === formData.country);
        if (isGlobalCountry(selectedCountry)) {
            setErrors((prev: any) => ({ ...prev, country: 'Please select a valid country' }));
            return;
        }

        setLoading(true);
        try {
            const res = await import('@/lib/api').then(mod => mod.signupUser({
                firstName: formData.firstName,
                lastName: formData.lastName,
                email: formData.email,
                password: formData.password,
                country: formData.country,
                captchaToken: captchaValue,
                captchaAction
            }));
            login(res.user);
            onClose();
        } catch (err: any) {
            if (err.response?.data?.errors) {
                const backendErrors = err.response.data.errors;
                const fieldErrors: any = {};

                backendErrors.forEach((issue: any) => {
                    if (issue.path) fieldErrors[issue.path[0]] = issue.message;
                });
                setErrors(fieldErrors);
                setGeneralError('Please fix the errors below');
            } else {
                setGeneralError(err.response?.data?.message || 'Signup failed');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleOrgSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setGeneralError('');
        setErrors({});

        // Check Captcha (only if configured)
        const recaptchaEnabled = Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY);
        let captchaValue = undefined;
        let captchaAction = undefined;
        if (recaptchaEnabled) {
            if (!executeRecaptcha) {
                setGeneralError('Security check initializing, please wait...');
                return;
            }
            captchaValue = await executeRecaptcha('org_signup');
            captchaAction = 'org_signup';
            if (!captchaValue) {
                setGeneralError('Security check failed. Please try again.');
                return;
            }
        }

        const newErrors: any = {};
        if (!orgData.orgName) newErrors.orgName = 'Organization Name is required';
        if (!orgData.email) newErrors.email = 'Email is required';
        if (!orgData.website) newErrors.website = 'Website is required';
        if (!orgData.countryId) newErrors.countryId = 'Country is required';
        if (!orgData.categoryId) newErrors.categoryId = 'Category is required';
        // if (!orgData.firstName) newErrors.firstName = 'First Name is required'; // Removed
        // if (!orgData.lastName) newErrors.lastName = 'Last Name is required'; // Removed
        if (!orgData.password) {
            newErrors.password = 'Password is required';
        } else {
            const validation = validatePassword(orgData.password);
            if (!validation.ok) {
                newErrors.password = validation.message || 'Password is invalid';
            }
        }
        if (!orgData.confirmPassword) newErrors.confirmPassword = 'Confirm password is required';
        if (orgData.password && orgData.confirmPassword && orgData.password !== orgData.confirmPassword) {
            newErrors.confirmPassword = 'Passwords do not match';
        }
        if (!orgData.phone) newErrors.phone = 'Phone is required';
        if (!orgData.address) newErrors.address = 'Address is required';
        if (!orgData.type) newErrors.type = 'Organization Type is required';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setLoading(true);
        try {
            const res = await signupOrganization({
                orgName: orgData.orgName,
                email: orgData.email,
                password: orgData.password,
                website: orgData.website,
                phone: orgData.phone,
                address: orgData.address,
                countryId: orgData.countryId,
                stateId: orgData.stateId,
                categoryId: orgData.categoryId,
                type: orgData.type,
                about: orgData.about,
                logo: orgData.logo,
                captchaToken: captchaValue,
                captchaAction
            });
            login(res.user);
            onClose();
        } catch (err: any) {
            if (err.response?.data?.errors) {
                const backendErrors = err.response.data.errors;
                const fieldErrors: any = {};

                backendErrors.forEach((issue: any) => {
                    if (issue.path) fieldErrors[issue.path[0]] = issue.message;
                });
                setErrors(fieldErrors);
                setGeneralError('Please fix the errors below');
            } else {
                setGeneralError(err.response?.data?.message || 'Organization signup failed');
            }
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const individualCountries = countries.filter((country) => !isGlobalCountry(country));
    const selectedOrgCountry = countries.find((country) => country.id === orgData.countryId);
    const orgCountryIsGlobal = isGlobalCountry(selectedOrgCountry);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-8 overflow-hidden max-h-[90vh] overflow-y-auto">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                </button>

                <div className="mb-6 text-center">
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
                        Create Account
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">Join VeriLnk today</p>
                </div>

                <div className="flex p-1 mb-6 bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700/50">
                    <button
                        onClick={() => setSignupType('INDIVIDUAL')}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${signupType === 'INDIVIDUAL'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        Individual
                    </button>
                    <button
                        onClick={() => setSignupType('ORGANIZATION')}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${signupType === 'ORGANIZATION'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        Organization
                    </button>
                </div>

                {generalError && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center flex items-center justify-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {generalError}
                    </div>
                )}

                {signupType === 'INDIVIDUAL' ? (
                    <form onSubmit={handleIndividualSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">First Name</label>
                                <input name="firstName" value={formData.firstName} onChange={handleIndividualChange} className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" placeholder="John" />
                                {errors.firstName && <p className="text-xs text-red-400 ml-1">{errors.firstName}</p>}
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Last Name</label>
                                <input name="lastName" value={formData.lastName} onChange={handleIndividualChange} className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" placeholder="Doe" />
                                {errors.lastName && <p className="text-xs text-red-400 ml-1">{errors.lastName}</p>}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Email</label>
                            <input name="email" type="email" value={formData.email} onChange={handleIndividualChange} className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" placeholder="john@example.com" />
                            {errors.email && <p className="text-xs text-red-400 ml-1">{errors.email}</p>}
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Country</label>
                            <select name="country" value={formData.country} onChange={(e) => {
                                handleIndividualChange(e as any);
                            }} className={signupSelectClass}>
                                <option className={signupSelectOptionClass} value="">Select Country</option>
                                {individualCountries.map(c => <option className={signupSelectOptionClass} key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            {errors.country && <p className="text-xs text-red-400 ml-1">{errors.country}</p>}
                        </div>

                        <PasswordFields
                            password={formData.password}
                            setPassword={(value) => {
                                setFormData((prev) => ({ ...prev, password: value }));
                                setErrors((prev: any) => ({ ...prev, password: undefined, confirmPassword: undefined }));
                            }}
                            confirmPassword={formData.confirmPassword}
                            setConfirmPassword={(value) => {
                                setFormData((prev) => ({ ...prev, confirmPassword: value }));
                                setErrors((prev: any) => ({ ...prev, confirmPassword: undefined }));
                            }}
                            required
                            labelClassName="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1"
                            inputClassName="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm"
                            className="ml-0.5"
                            passwordError={errors.password}
                            confirmError={errors.confirmPassword}
                        />

                        {process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && !executeRecaptcha && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
                                Security check initializing, please wait...
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || (Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) && !executeRecaptcha)}
                            className="w-full btn-primary font-medium py-2.5 rounded-lg mt-4 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Create Account'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleOrgSubmit} className="space-y-4">
                        <div className="flex justify-center mb-6">
                            <div className="relative group">
                                <div className="w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center overflow-hidden">
                                    {(logoPreviewUrl || uploadedLogoUrl || orgData.logo) ? (

                                        <Image
                                            src={logoPreviewUrl || uploadedLogoUrl || orgData.logo}
                                            alt="Logo"
                                            fill
                                            className="object-cover"
                                            sizes="96px"
                                        />
                                    ) : (
                                        <Building2 className="w-8 h-8 text-slate-400" />
                                    )}
                                    {uploadingLogo && (
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                                        </div>
                                    )}
                                </div>
                                <label className="absolute bottom-0 right-0 btn-primary p-1.5 rounded-full cursor-pointer shadow-lg transition-colors">
                                    <input type="file" className="hidden" accept="image/*,.svg" onChange={handleLogoUpload} />
                                    <span className="sr-only">Upload Logo</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
                                </label>
                                {(logoPreviewUrl || uploadedLogoUrl || orgData.logo) && (
                                    <button
                                        type="button"
                                        onClick={handleRemoveLogo}
                                        className="absolute -top-2 -right-2 bg-slate-900/80 text-white p-1.5 rounded-full shadow hover:bg-slate-900 transition-colors"
                                        aria-label="Remove logo"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                            {errors.logo && <p className="text-xs text-red-500 mt-2 text-center absolute -bottom-6 w-full">{errors.logo}</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Org Type</label>
                                <select name="type" value={orgData.type} onChange={handleOrgChange} className={signupSelectClass}>
                                    <option className={signupSelectOptionClass} value="PUBLIC">Public</option>
                                    <option className={signupSelectOptionClass} value="PRIVATE">Private</option>
                                    <option className={signupSelectOptionClass} value="NON_PROFIT">Non-profit</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Organization Name</label>
                                <div className="relative">
                                    <Building2 className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                                    <input name="orgName" value={orgData.orgName} onChange={handleOrgChange} className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-slate-900 dark:text-white text-sm" placeholder="Acme Inc." />
                                </div>
                                {errors.orgName && <p className="text-xs text-red-400 ml-1">{errors.orgName}</p>}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Admin Name fields removed */}
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Organization Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                                <input name="email" type="email" value={orgData.email} onChange={handleOrgChange} className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-slate-900 dark:text-white text-sm" placeholder="contact@acme.com" />
                            </div>
                            {errors.email && <p className="text-xs text-red-400 ml-1">{errors.email}</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Website URL</label>
                                <div className="relative">
                                    <Globe className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                                    <input name="website" value={orgData.website} onChange={handleOrgChange} className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-slate-900 dark:text-white text-sm" placeholder="https://acme.com" />
                                </div>
                                {errors.website && <p className="text-xs text-red-400 ml-1">{errors.website}</p>}
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Phone</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                                    <input name="phone" value={orgData.phone} onChange={handleOrgChange} className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-slate-900 dark:text-white text-sm" placeholder="+1 234..." />
                                </div>
                                {errors.phone && <p className="text-xs text-red-400 ml-1">{errors.phone}</p>}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Country</label>
                            <select name="countryId" value={orgData.countryId} onChange={handleOrgChange} className={signupSelectClass}>
                                <option className={signupSelectOptionClass} value="">Select Country</option>
                                {countries.map(c => <option className={signupSelectOptionClass} key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            {errors.countryId && <p className="text-xs text-red-400 ml-1">{errors.countryId}</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">State (Optional)</label>
                                <select
                                    name="stateId"
                                    value={orgData.stateId}
                                    onChange={handleOrgChange}
                                    disabled={!orgData.countryId || fetchingStates || orgCountryIsGlobal}
                                    className={signupSelectClass}
                                >
                                    <option className={signupSelectOptionClass} value="">
                                        {orgCountryIsGlobal ? 'State not applicable for Global' : 'Select State'}
                                    </option>
                                    {states.map(s => <option className={signupSelectOptionClass} key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Category</label>
                                <select name="categoryId" value={orgData.categoryId} onChange={handleOrgChange} className={signupSelectClass}>
                                    <option className={signupSelectOptionClass} value="">Select Category</option>
                                    {categories.map(c => <option className={signupSelectOptionClass} key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                                {errors.categoryId && <p className="text-xs text-red-400 ml-1">{errors.categoryId}</p>}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">About Organization</label>
                            <textarea name="about" value={orgData.about} onChange={handleOrgChange} className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm min-h-[80px]" placeholder="Brief description..." />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Office Address</label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                                <input name="address" value={orgData.address} onChange={handleOrgChange} className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-slate-900 dark:text-white text-sm" placeholder="123 Main St..." />
                            </div>
                            {errors.address && <p className="text-xs text-red-400 ml-1">{errors.address}</p>}
                        </div>

                        <PasswordFields
                            password={orgData.password}
                            setPassword={(value) => {
                                setOrgData((prev) => ({ ...prev, password: value }));
                                setErrors((prev: any) => ({ ...prev, password: undefined, confirmPassword: undefined }));
                            }}
                            confirmPassword={orgData.confirmPassword}
                            setConfirmPassword={(value) => {
                                setOrgData((prev) => ({ ...prev, confirmPassword: value }));
                                setErrors((prev: any) => ({ ...prev, confirmPassword: undefined }));
                            }}
                            required
                            labelClassName="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1"
                            inputClassName="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm"
                            className="ml-0.5"
                            passwordError={errors.password}
                            confirmError={errors.confirmPassword}
                        />

                        {process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && !executeRecaptcha && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
                                Security check initializing, please wait...
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || (Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) && !executeRecaptcha)}
                            className="w-full btn-primary font-medium py-2.5 rounded-lg mt-4 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Register Organization'}
                        </button>
                    </form>
                )}

                <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    Already have an account?{' '}
                    <button onClick={onSwitchToLogin} className="text-purple-400 hover:text-purple-300 font-medium transition-colors">
                        Sign In
                    </button>
                </div>
            </div>
        </div>
    );
}
