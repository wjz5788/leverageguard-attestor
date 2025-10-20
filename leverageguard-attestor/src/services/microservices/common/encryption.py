import base64
import hashlib
import hmac
import os
from typing import Any, Dict, Optional, Union, Tuple
import cryptography
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes, padding, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding as asymmetric_padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from .errors import BaseError
from .logging_system import logger

class EncryptionError(BaseError):
    """加密相关异常"""
    
    def __init__(self,
                 message: str = "Encryption error",
                 error_code: str = "ENCRYPTION_ERROR",
                 **kwargs):
        super().__init__(message, error_code, **kwargs)

class SymmetricEncryption:
    """对称加密工具类"""
    
    @staticmethod
    def generate_key() -> str:
        """生成对称加密密钥"""
        return Fernet.generate_key().decode('utf-8')
    
    @staticmethod
    def encrypt(data: Union[str, bytes], key: str) -> str:
        """使用Fernet进行数据加密"""
        try:
            # 确保密钥是bytes类型
            if isinstance(key, str):
                key_bytes = key.encode('utf-8')
            else:
                key_bytes = key
            
            # 确保数据是bytes类型
            if isinstance(data, str):
                data_bytes = data.encode('utf-8')
            else:
                data_bytes = data
            
            # 创建Fernet对象并加密
            fernet = Fernet(key_bytes)
            encrypted_data = fernet.encrypt(data_bytes)
            
            # 返回Base64编码的字符串
            return encrypted_data.decode('utf-8')
        except Exception as e:
            logger.error(f"Failed to encrypt data: {str(e)}")
            raise EncryptionError(message="Failed to encrypt data", details={"error": str(e)})
    
    @staticmethod
    def decrypt(encrypted_data: Union[str, bytes], key: str) -> str:
        """使用Fernet进行数据解密"""
        try:
            # 确保密钥是bytes类型
            if isinstance(key, str):
                key_bytes = key.encode('utf-8')
            else:
                key_bytes = key
            
            # 确保加密数据是bytes类型
            if isinstance(encrypted_data, str):
                encrypted_bytes = encrypted_data.encode('utf-8')
            else:
                encrypted_bytes = encrypted_data
            
            # 创建Fernet对象并解密
            fernet = Fernet(key_bytes)
            decrypted_data = fernet.decrypt(encrypted_bytes)
            
            # 返回字符串
            return decrypted_data.decode('utf-8')
        except cryptography.fernet.InvalidToken:
            logger.error("Invalid encryption token")
            raise EncryptionError(message="Invalid encryption token", error_code="INVALID_ENCRYPTION_TOKEN")
        except Exception as e:
            logger.error(f"Failed to decrypt data: {str(e)}")
            raise EncryptionError(message="Failed to decrypt data", details={"error": str(e)})
    
    @staticmethod
    def aes_encrypt(
        data: Union[str, bytes],
        key: Union[str, bytes],
        mode: str = "GCM",
        iv: Optional[bytes] = None
    ) -> Tuple[str, str, str]:
        """使用AES进行加密"""
        try:
            # 确保密钥是bytes类型
            if isinstance(key, str):
                # 如果密钥是字符串，使用SHA-256哈希确保长度正确
                key_bytes = hashlib.sha256(key.encode('utf-8')).digest()
            else:
                key_bytes = key
            
            # 确保数据是bytes类型
            if isinstance(data, str):
                data_bytes = data.encode('utf-8')
            else:
                data_bytes = data
            
            # 生成IV（初始化向量）
            if iv is None:
                if mode == "GCM":
                    iv = os.urandom(12)  # GCM模式推荐使用12字节IV
                else:
                    iv = os.urandom(16)  # 其他模式使用16字节IV
            
            # 创建加密器
            if mode == "GCM":
                cipher = Cipher(algorithms.AES(key_bytes), modes.GCM(iv), backend=default_backend())
                encryptor = cipher.encryptor()
                encrypted_data = encryptor.update(data_bytes) + encryptor.finalize()
                tag = encryptor.tag
                
                # 返回加密数据、IV和标签（base64编码）
                return (
                    base64.b64encode(encrypted_data).decode('utf-8'),
                    base64.b64encode(iv).decode('utf-8'),
                    base64.b64encode(tag).decode('utf-8')
                )
            elif mode == "CBC":
                # CBC模式需要填充
                padder = padding.PKCS7(128).padder()  # AES块大小为128位
                padded_data = padder.update(data_bytes) + padder.finalize()
                
                cipher = Cipher(algorithms.AES(key_bytes), modes.CBC(iv), backend=default_backend())
                encryptor = cipher.encryptor()
                encrypted_data = encryptor.update(padded_data) + encryptor.finalize()
                
                # 返回加密数据和IV（base64编码）
                return (
                    base64.b64encode(encrypted_data).decode('utf-8'),
                    base64.b64encode(iv).decode('utf-8'),
                    ""
                )
            else:
                raise ValueError(f"Unsupported AES mode: {mode}")
        except Exception as e:
            logger.error(f"AES encryption failed: {str(e)}")
            raise EncryptionError(message="AES encryption failed", details={"error": str(e)})
    
    @staticmethod
    def aes_decrypt(
        encrypted_data: Union[str, bytes],
        key: Union[str, bytes],
        iv: Union[str, bytes],
        mode: str = "GCM",
        tag: Optional[Union[str, bytes]] = None
    ) -> str:
        """使用AES进行解密"""
        try:
            # 确保密钥是bytes类型
            if isinstance(key, str):
                # 如果密钥是字符串，使用SHA-256哈希确保长度正确
                key_bytes = hashlib.sha256(key.encode('utf-8')).digest()
            else:
                key_bytes = key
            
            # 确保加密数据是bytes类型
            if isinstance(encrypted_data, str):
                encrypted_bytes = base64.b64decode(encrypted_data)
            else:
                encrypted_bytes = encrypted_data
            
            # 确保IV是bytes类型
            if isinstance(iv, str):
                iv_bytes = base64.b64decode(iv)
            else:
                iv_bytes = iv
            
            # 确保标签是bytes类型（如果提供）
            tag_bytes = None
            if tag:
                if isinstance(tag, str):
                    tag_bytes = base64.b64decode(tag)
                else:
                    tag_bytes = tag
            
            # 创建解密器
            if mode == "GCM":
                if not tag_bytes:
                    raise ValueError("Tag is required for GCM mode")
                
                cipher = Cipher(algorithms.AES(key_bytes), modes.GCM(iv_bytes, tag_bytes), backend=default_backend())
                decryptor = cipher.decryptor()
                decrypted_data = decryptor.update(encrypted_bytes) + decryptor.finalize()
            elif mode == "CBC":
                cipher = Cipher(algorithms.AES(key_bytes), modes.CBC(iv_bytes), backend=default_backend())
                decryptor = cipher.decryptor()
                padded_data = decryptor.update(encrypted_bytes) + decryptor.finalize()
                
                # 移除填充
                unpadder = padding.PKCS7(128).unpadder()
                decrypted_data = unpadder.update(padded_data) + unpadder.finalize()
            else:
                raise ValueError(f"Unsupported AES mode: {mode}")
            
            # 返回解密后的字符串
            return decrypted_data.decode('utf-8')
        except Exception as e:
            logger.error(f"AES decryption failed: {str(e)}")
            raise EncryptionError(message="AES decryption failed", details={"error": str(e)})

class AsymmetricEncryption:
    """非对称加密工具类"""
    
    @staticmethod
    def generate_rsa_keys(
        key_size: int = 2048,
        public_exponent: int = 65537
    ) -> Tuple[bytes, bytes]:
        """生成RSA密钥对"""
        try:
            # 生成私钥
            private_key = rsa.generate_private_key(
                public_exponent=public_exponent,
                key_size=key_size,
                backend=default_backend()
            )
            
            # 导出私钥（PEM格式）
            private_pem = private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            )
            
            # 导出公钥（PEM格式）
            public_key = private_key.public_key()
            public_pem = public_key.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo
            )
            
            return private_pem, public_pem
        except Exception as e:
            logger.error(f"Failed to generate RSA keys: {str(e)}")
            raise EncryptionError(message="Failed to generate RSA keys", details={"error": str(e)})
    
    @staticmethod
    def load_rsa_private_key(private_key_pem: bytes) -> Any:
        """加载RSA私钥"""
        try:
            return serialization.load_pem_private_key(
                private_key_pem,
                password=None,
                backend=default_backend()
            )
        except Exception as e:
            logger.error(f"Failed to load RSA private key: {str(e)}")
            raise EncryptionError(message="Failed to load RSA private key", details={"error": str(e)})
    
    @staticmethod
    def load_rsa_public_key(public_key_pem: bytes) -> Any:
        """加载RSA公钥"""
        try:
            return serialization.load_pem_public_key(
                public_key_pem,
                backend=default_backend()
            )
        except Exception as e:
            logger.error(f"Failed to load RSA public key: {str(e)}")
            raise EncryptionError(message="Failed to load RSA public key", details={"error": str(e)})
    
    @staticmethod
    def encrypt_with_public_key(
        data: Union[str, bytes],
        public_key: Any
    ) -> bytes:
        """使用RSA公钥加密数据"""
        try:
            # 确保数据是bytes类型
            if isinstance(data, str):
                data_bytes = data.encode('utf-8')
            else:
                data_bytes = data
            
            # 加密数据
            encrypted_data = public_key.encrypt(
                data_bytes,
                asymmetric_padding.OAEP(
                    mgf=asymmetric_padding.MGF1(algorithm=hashes.SHA256()),
                    algorithm=hashes.SHA256(),
                    label=None
                )
            )
            
            return encrypted_data
        except Exception as e:
            logger.error(f"RSA encryption failed: {str(e)}")
            raise EncryptionError(message="RSA encryption failed", details={"error": str(e)})
    
    @staticmethod
    def decrypt_with_private_key(
        encrypted_data: bytes,
        private_key: Any
    ) -> str:
        """使用RSA私钥解密数据"""
        try:
            # 解密数据
            decrypted_data = private_key.decrypt(
                encrypted_data,
                asymmetric_padding.OAEP(
                    mgf=asymmetric_padding.MGF1(algorithm=hashes.SHA256()),
                    algorithm=hashes.SHA256(),
                    label=None
                )
            )
            
            # 返回解密后的字符串
            return decrypted_data.decode('utf-8')
        except Exception as e:
            logger.error(f"RSA decryption failed: {str(e)}")
            raise EncryptionError(message="RSA decryption failed", details={"error": str(e)})
    
    @staticmethod
    def sign_with_private_key(
        data: Union[str, bytes],
        private_key: Any
    ) -> bytes:
        """使用RSA私钥签名数据"""
        try:
            # 确保数据是bytes类型
            if isinstance(data, str):
                data_bytes = data.encode('utf-8')
            else:
                data_bytes = data
            
            # 创建签名
            signature = private_key.sign(
                data_bytes,
                asymmetric_padding.PSS(
                    mgf=asymmetric_padding.MGF1(algorithm=hashes.SHA256()),
                    salt_length=asymmetric_padding.PSS.MAX_LENGTH
                ),
                hashes.SHA256()
            )
            
            return signature
        except Exception as e:
            logger.error(f"RSA signing failed: {str(e)}")
            raise EncryptionError(message="RSA signing failed", details={"error": str(e)})
    
    @staticmethod
    def verify_signature(
        data: Union[str, bytes],
        signature: bytes,
        public_key: Any
    ) -> bool:
        """使用RSA公钥验证签名"""
        try:
            # 确保数据是bytes类型
            if isinstance(data, str):
                data_bytes = data.encode('utf-8')
            else:
                data_bytes = data
            
            # 验证签名
            public_key.verify(
                signature,
                data_bytes,
                asymmetric_padding.PSS(
                    mgf=asymmetric_padding.MGF1(algorithm=hashes.SHA256()),
                    salt_length=asymmetric_padding.PSS.MAX_LENGTH
                ),
                hashes.SHA256()
            )
            
            return True
        except cryptography.exceptions.InvalidSignature:
            logger.warning("Invalid signature")
            return False
        except Exception as e:
            logger.error(f"RSA signature verification failed: {str(e)}")
            return False

class HashUtils:
    """哈希工具类"""
    
    @staticmethod
    def hash_sha256(data: Union[str, bytes]) -> str:
        """计算SHA-256哈希值"""
        try:
            # 确保数据是bytes类型
            if isinstance(data, str):
                data_bytes = data.encode('utf-8')
            else:
                data_bytes = data
            
            # 计算哈希值
            hash_obj = hashlib.sha256(data_bytes)
            return hash_obj.hexdigest()
        except Exception as e:
            logger.error(f"SHA-256 hashing failed: {str(e)}")
            raise EncryptionError(message="SHA-256 hashing failed", details={"error": str(e)})
    
    @staticmethod
    def hash_sha512(data: Union[str, bytes]) -> str:
        """计算SHA-512哈希值"""
        try:
            # 确保数据是bytes类型
            if isinstance(data, str):
                data_bytes = data.encode('utf-8')
            else:
                data_bytes = data
            
            # 计算哈希值
            hash_obj = hashlib.sha512(data_bytes)
            return hash_obj.hexdigest()
        except Exception as e:
            logger.error(f"SHA-512 hashing failed: {str(e)}")
            raise EncryptionError(message="SHA-512 hashing failed", details={"error": str(e)})
    
    @staticmethod
    def hash_md5(data: Union[str, bytes]) -> str:
        """计算MD5哈希值（注意：MD5安全性较低，仅用于非安全场景）"""
        try:
            # 确保数据是bytes类型
            if isinstance(data, str):
                data_bytes = data.encode('utf-8')
            else:
                data_bytes = data
            
            # 计算哈希值
            hash_obj = hashlib.md5(data_bytes)
            return hash_obj.hexdigest()
        except Exception as e:
            logger.error(f"MD5 hashing failed: {str(e)}")
            raise EncryptionError(message="MD5 hashing failed", details={"error": str(e)})
    
    @staticmethod
    def hmac_sha256(data: Union[str, bytes], key: Union[str, bytes]) -> str:
        """计算HMAC-SHA256哈希值"""
        try:
            # 确保数据是bytes类型
            if isinstance(data, str):
                data_bytes = data.encode('utf-8')
            else:
                data_bytes = data
            
            # 确保密钥是bytes类型
            if isinstance(key, str):
                key_bytes = key.encode('utf-8')
            else:
                key_bytes = key
            
            # 计算HMAC
            hmac_obj = hmac.new(key_bytes, data_bytes, hashlib.sha256)
            return hmac_obj.hexdigest()
        except Exception as e:
            logger.error(f"HMAC-SHA256 hashing failed: {str(e)}")
            raise EncryptionError(message="HMAC-SHA256 hashing failed", details={"error": str(e)})
    
    @staticmethod
    def generate_salt(size: int = 16) -> str:
        """生成随机盐"""
        return base64.b64encode(os.urandom(size)).decode('utf-8')
    
    @staticmethod
    def hash_with_salt(data: Union[str, bytes], salt: Union[str, bytes]) -> str:
        """使用盐计算数据的哈希值"""
        # 确保数据是bytes类型
        if isinstance(data, str):
            data_bytes = data.encode('utf-8')
        else:
            data_bytes = data
        
        # 确保盐是bytes类型
        if isinstance(salt, str):
            salt_bytes = salt.encode('utf-8')
        else:
            salt_bytes = salt
        
        # 组合数据和盐
        combined = data_bytes + salt_bytes
        
        # 计算哈希值
        return HashUtils.hash_sha256(combined)

# 导出所有类和函数
__all__ = [
    'EncryptionError',
    'SymmetricEncryption',
    'AsymmetricEncryption',
    'HashUtils'
]