import re
import ipaddress
from typing import Any, Dict, List, Optional, Tuple, Union, Callable
import datetime
import hashlib
import uuid
from decimal import Decimal, InvalidOperation
from pydantic import BaseModel, ValidationError, validator as pydantic_validator
from .errors import ValidationError as CustomValidationError
from .logging_system import logger

# 常用正则表达式
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
PHONE_REGEX = re.compile(r"^\+?[1-9]\d{1,14}$")  # E.164国际电话号码格式
URL_REGEX = re.compile(r"^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$")
ETH_ADDRESS_REGEX = re.compile(r"^0x[a-fA-F0-9]{40}$")
UUID_REGEX = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

class Validator:
    """数据验证器类"""
    
    @staticmethod
    def is_email(value: str) -> bool:
        """验证是否为有效的电子邮件地址"""
        if not isinstance(value, str):
            return False
        return bool(EMAIL_REGEX.match(value))
    
    @staticmethod
    def is_phone(value: str) -> bool:
        """验证是否为有效的电话号码（E.164格式）"""
        if not isinstance(value, str):
            return False
        return bool(PHONE_REGEX.match(value))
    
    @staticmethod
    def is_url(value: str) -> bool:
        """验证是否为有效的URL"""
        if not isinstance(value, str):
            return False
        return bool(URL_REGEX.match(value))
    
    @staticmethod
    def is_eth_address(value: str) -> bool:
        """验证是否为有效的以太坊地址"""
        if not isinstance(value, str):
            return False
        return bool(ETH_ADDRESS_REGEX.match(value))
    
    @staticmethod
    def is_uuid(value: str) -> bool:
        """验证是否为有效的UUID"""
        if not isinstance(value, str):
            return False
        return bool(UUID_REGEX.match(value))
    
    @staticmethod
    def is_ip_address(value: str) -> bool:
        """验证是否为有效的IP地址"""
        if not isinstance(value, str):
            return False
        try:
            ipaddress.ip_address(value)
            return True
        except ValueError:
            return False
    
    @staticmethod
    def is_date(value: str, format: str = "%Y-%m-%d") -> bool:
        """验证是否为有效的日期字符串"""
        if not isinstance(value, str):
            return False
        try:
            datetime.datetime.strptime(value, format)
            return True
        except ValueError:
            return False
    
    @staticmethod
    def is_decimal(value: Any) -> bool:
        """验证是否为有效的十进制数值"""
        try:
            if isinstance(value, str):
                Decimal(value)
            else:
                Decimal(str(value))
            return True
        except (InvalidOperation, TypeError, ValueError):
            return False
    
    @staticmethod
    def is_in_range(value: Union[int, float, Decimal], min_value: Union[int, float, Decimal] = None, max_value: Union[int, float, Decimal] = None) -> bool:
        """验证数值是否在指定范围内"""
        if not isinstance(value, (int, float, Decimal)):
            return False
        if min_value is not None and value < min_value:
            return False
        if max_value is not None and value > max_value:
            return False
        return True
    
    @staticmethod
    def is_length_in_range(value: Union[str, list, tuple, dict], min_length: int = None, max_length: int = None) -> bool:
        """验证长度是否在指定范围内"""
        if not hasattr(value, '__len__'):
            return False
        length = len(value)
        if min_length is not None and length < min_length:
            return False
        if max_length is not None and length > max_length:
            return False
        return True
    
    @staticmethod
    def is_hex_color(value: str) -> bool:
        """验证是否为有效的十六进制颜色值"""
        if not isinstance(value, str):
            return False
        # 支持 #RGB, #RGBA, #RRGGBB, #RRGGBBAA 格式
        return bool(re.match(r"^#([A-Fa-f0-9]{3,4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$", value))
    
    @staticmethod
    def is_alphanumeric(value: str) -> bool:
        """验证是否只包含字母和数字"""
        if not isinstance(value, str):
            return False
        return value.isalnum()
    
    @staticmethod
    def contains_only_chars(value: str, allowed_chars: str) -> bool:
        """验证是否只包含允许的字符"""
        if not isinstance(value, str):
            return False
        return all(c in allowed_chars for c in value)
    
    @staticmethod
    def has_valid_file_extension(value: str, allowed_extensions: List[str]) -> bool:
        """验证文件扩展名是否有效"""
        if not isinstance(value, str):
            return False
        _, ext = os.path.splitext(value.lower())
        return ext.lstrip('.') in allowed_extensions

import os  # 放到这里是为了避免循环导入问题

class ValidationResult:
    """验证结果类"""
    
    def __init__(self, is_valid: bool = True, error_message: str = None):
        self.is_valid = is_valid
        self.error_message = error_message
    
    def __bool__(self):
        return self.is_valid
    
    def __str__(self):
        return f"ValidationResult(is_valid={self.is_valid}, error_message={self.error_message})"

class ValidationRule:
    """验证规则基类"""
    
    def __init__(self, error_message: str = None):
        self.error_message = error_message
    
    def validate(self, value: Any) -> ValidationResult:
        """执行验证"""
        raise NotImplementedError("Subclasses must implement validate method")

class RegexRule(ValidationRule):
    """正则表达式验证规则"""
    
    def __init__(self, pattern: Union[str, re.Pattern], error_message: str = "Invalid format"):
        self.pattern = re.compile(pattern) if isinstance(pattern, str) else pattern
        super().__init__(error_message)
    
    def validate(self, value: Any) -> ValidationResult:
        if not isinstance(value, str):
            return ValidationResult(False, "Value must be a string")
        if not self.pattern.match(value):
            return ValidationResult(False, self.error_message)
        return ValidationResult(True)

class RangeRule(ValidationRule):
    """数值范围验证规则"""
    
    def __init__(self, min_value: Union[int, float, Decimal] = None, max_value: Union[int, float, Decimal] = None, error_message: str = None):
        self.min_value = min_value
        self.max_value = max_value
        if not error_message:
            if min_value is not None and max_value is not None:
                error_message = f"Value must be between {min_value} and {max_value}"
            elif min_value is not None:
                error_message = f"Value must be at least {min_value}"
            elif max_value is not None:
                error_message = f"Value must be at most {max_value}"
        super().__init__(error_message)
    
    def validate(self, value: Any) -> ValidationResult:
        if not isinstance(value, (int, float, Decimal)):
            return ValidationResult(False, "Value must be a number")
        if self.min_value is not None and value < self.min_value:
            return ValidationResult(False, self.error_message)
        if self.max_value is not None and value > self.max_value:
            return ValidationResult(False, self.error_message)
        return ValidationResult(True)

class LengthRule(ValidationRule):
    """长度验证规则"""
    
    def __init__(self, min_length: int = None, max_length: int = None, error_message: str = None):
        self.min_length = min_length
        self.max_length = max_length
        if not error_message:
            if min_length is not None and max_length is not None:
                error_message = f"Length must be between {min_length} and {max_length}"
            elif min_length is not None:
                error_message = f"Length must be at least {min_length}"
            elif max_length is not None:
                error_message = f"Length must be at most {max_length}"
        super().__init__(error_message)
    
    def validate(self, value: Any) -> ValidationResult:
        if not hasattr(value, '__len__'):
            return ValidationResult(False, "Value must have length")
        length = len(value)
        if self.min_length is not None and length < self.min_length:
            return ValidationResult(False, self.error_message)
        if self.max_length is not None and length > self.max_length:
            return ValidationResult(False, self.error_message)
        return ValidationResult(True)

class CustomRule(ValidationRule):
    """自定义验证规则"""
    
    def __init__(self, validation_func: Callable[[Any], bool], error_message: str = "Validation failed"):
        self.validation_func = validation_func
        super().__init__(error_message)
    
    def validate(self, value: Any) -> ValidationResult:
        try:
            if self.validation_func(value):
                return ValidationResult(True)
            return ValidationResult(False, self.error_message)
        except Exception as e:
            logger.error(f"Custom validation rule failed: {str(e)}")
            return ValidationResult(False, f"Validation error: {str(e)}")

class ValidatorChain:
    """验证器链，用于组合多个验证规则"""
    
    def __init__(self, rules: List[ValidationRule] = None):
        self.rules = rules or []
    
    def add_rule(self, rule: ValidationRule) -> 'ValidatorChain':
        """添加验证规则"""
        self.rules.append(rule)
        return self
    
    def validate(self, value: Any) -> ValidationResult:
        """执行所有验证规则"""
        for rule in self.rules:
            result = rule.validate(value)
            if not result:
                return result
        return ValidationResult(True)

# 预定义的常用验证器
validator = Validator()

# 验证器函数
def validate_email(value: str) -> None:
    """验证电子邮件地址，如果无效则抛出异常"""
    if not validator.is_email(value):
        raise CustomValidationError(
            message="Invalid email address",
            error_code="INVALID_EMAIL",
            details={"email": value}
        )

def validate_phone(value: str) -> None:
    """验证电话号码，如果无效则抛出异常"""
    if not validator.is_phone(value):
        raise CustomValidationError(
            message="Invalid phone number",
            error_code="INVALID_PHONE",
            details={"phone": value}
        )

def validate_url(value: str) -> None:
    """验证URL，如果无效则抛出异常"""
    if not validator.is_url(value):
        raise CustomValidationError(
            message="Invalid URL",
            error_code="INVALID_URL",
            details={"url": value}
        )

def validate_eth_address(value: str) -> None:
    """验证以太坊地址，如果无效则抛出异常"""
    if not validator.is_eth_address(value):
        raise CustomValidationError(
            message="Invalid Ethereum address",
            error_code="INVALID_ETH_ADDRESS",
            details={"address": value}
        )

def validate_uuid(value: str) -> None:
    """验证UUID，如果无效则抛出异常"""
    if not validator.is_uuid(value):
        raise CustomValidationError(
            message="Invalid UUID",
            error_code="INVALID_UUID",
            details={"uuid": value}
        )

def validate_date(value: str, format: str = "%Y-%m-%d") -> None:
    """验证日期字符串，如果无效则抛出异常"""
    if not validator.is_date(value, format):
        raise CustomValidationError(
            message=f"Invalid date format, expected {format}",
            error_code="INVALID_DATE",
            details={"date": value, "format": format}
        )

def validate_decimal(value: Any) -> None:
    """验证十进制数值，如果无效则抛出异常"""
    if not validator.is_decimal(value):
        raise CustomValidationError(
            message="Invalid decimal value",
            error_code="INVALID_DECIMAL",
            details={"value": value}
        )

def validate_in_range(value: Union[int, float, Decimal], min_value: Union[int, float, Decimal] = None, max_value: Union[int, float, Decimal] = None) -> None:
    """验证数值是否在指定范围内，如果不在则抛出异常"""
    if not validator.is_in_range(value, min_value, max_value):
        if min_value is not None and max_value is not None:
            message = f"Value must be between {min_value} and {max_value}"
        elif min_value is not None:
            message = f"Value must be at least {min_value}"
        elif max_value is not None:
            message = f"Value must be at most {max_value}"
        else:
            message = "Invalid value"
        raise CustomValidationError(
            message=message,
            error_code="VALUE_OUT_OF_RANGE",
            details={"value": value, "min": min_value, "max": max_value}
        )

def validate_length(value: Union[str, list, tuple, dict], min_length: int = None, max_length: int = None) -> None:
    """验证长度是否在指定范围内，如果不在则抛出异常"""
    if not validator.is_length_in_range(value, min_length, max_length):
        if min_length is not None and max_length is not None:
            message = f"Length must be between {min_length} and {max_length}"
        elif min_length is not None:
            message = f"Length must be at least {min_length}"
        elif max_length is not None:
            message = f"Length must be at most {max_length}"
        else:
            message = "Invalid length"
        raise CustomValidationError(
            message=message,
            error_code="INVALID_LENGTH",
            details={"length": len(value), "min": min_length, "max": max_length}
        )

# Pydantic验证器辅助函数
def pydantic_email_validator(field: str):
    """创建Pydantic电子邮件验证器"""
    def validator(value):
        if not validator.is_email(value):
            raise ValueError("Invalid email address")
        return value
    return pydantic_validator(field)(validator)

def pydantic_phone_validator(field: str):
    """创建Pydantic电话号码验证器"""
    def validator(value):
        if not validator.is_phone(value):
            raise ValueError("Invalid phone number")
        return value
    return pydantic_validator(field)(validator)

def pydantic_eth_address_validator(field: str):
    """创建Pydantic以太坊地址验证器"""
    def validator(value):
        if not validator.is_eth_address(value):
            raise ValueError("Invalid Ethereum address")
        return value.lower()
    return pydantic_validator(field)(validator)

def pydantic_range_validator(field: str, min_value: Union[int, float, Decimal] = None, max_value: Union[int, float, Decimal] = None):
    """创建Pydantic数值范围验证器"""
    def validator(value):
        if min_value is not None and value < min_value:
            raise ValueError(f"Value must be at least {min_value}")
        if max_value is not None and value > max_value:
            raise ValueError(f"Value must be at most {max_value}")
        return value
    return pydantic_validator(field)(validator)

# 导出所有类和函数
__all__ = [
    'Validator',
    'ValidationResult',
    'ValidationRule',
    'RegexRule',
    'RangeRule',
    'LengthRule',
    'CustomRule',
    'ValidatorChain',
    'validator',
    'validate_email',
    'validate_phone',
    'validate_url',
    'validate_eth_address',
    'validate_uuid',
    'validate_date',
    'validate_decimal',
    'validate_in_range',
    'validate_length',
    'pydantic_email_validator',
    'pydantic_phone_validator',
    'pydantic_eth_address_validator',
    'pydantic_range_validator'
]