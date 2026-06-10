#!/usr/bin/env python3
"""
Image processing utilities for omnichat
- Resize/compress images before sending
- Convert formats
- Generate thumbnails
"""

import io
import os
from pathlib import Path
from typing import Optional, Tuple

try:
    from PIL import Image, ImageOps
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


class ImageProcessor:
    """Process images for optimal delivery across messaging platforms."""
    
    # Platform-specific limits
    TELEGRAM_MAX_SIZE = 10 * 1024 * 1024  # 10MB for photos
    ZALO_MAX_SIZE = 5 * 1024 * 1024  # 5MB estimate
    DEFAULT_MAX_SIZE = 5 * 1024 * 1024
    
    # Quality settings
    DEFAULT_QUALITY = 85
    COMPRESSED_QUALITY = 75
    HIGH_COMPRESSION_QUALITY = 60
    
    # Max dimensions
    MAX_WIDTH = 2560
    MAX_HEIGHT = 2560
    
    @staticmethod
    def is_available() -> bool:
        """Check if PIL/Pillow is available."""
        return PIL_AVAILABLE
    
    @staticmethod
    def get_image_info(image_path: str) -> Optional[dict]:
        """Get image information (size, format, dimensions)."""
        if not PIL_AVAILABLE:
            return None
        
        try:
            path = Path(image_path)
            if not path.exists():
                return None
            
            with Image.open(path) as img:
                return {
                    "format": img.format,
                    "mode": img.mode,
                    "width": img.width,
                    "height": img.height,
                    "size_bytes": path.stat().st_size,
                    "size_mb": round(path.stat().st_size / (1024 * 1024), 2)
                }
        except Exception:
            return None
    
    @staticmethod
    def resize_image(
        image_path: str,
        output_path: Optional[str] = None,
        max_width: int = MAX_WIDTH,
        max_height: int = MAX_HEIGHT,
        quality: int = DEFAULT_QUALITY
    ) -> Optional[str]:
        """
        Resize image to fit within max dimensions while maintaining aspect ratio.
        
        Args:
            image_path: Path to input image
            output_path: Path to save resized image (None = overwrite original)
            max_width: Maximum width in pixels
            max_height: Maximum height in pixels
            quality: JPEG quality (1-100)
        
        Returns:
            Path to resized image or None on error
        """
        if not PIL_AVAILABLE:
            return None
        
        try:
            path = Path(image_path)
            if not path.exists():
                return None
            
            with Image.open(path) as img:
                # Convert RGBA to RGB if saving as JPEG
                if img.mode == 'RGBA' and (output_path and output_path.lower().endswith('.jpg')):
                    # Create white background
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[3])  # Use alpha channel as mask
                    img = background
                
                # Calculate new dimensions
                img.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
                
                # Determine output path
                if output_path is None:
                    output_path = str(path)
                
                # Save with optimization
                save_kwargs = {"optimize": True}
                if img.format in ('JPEG', 'JPG') or output_path.lower().endswith(('.jpg', '.jpeg')):
                    save_kwargs["quality"] = quality
                    save_kwargs["format"] = "JPEG"
                
                img.save(output_path, **save_kwargs)
                return output_path
                
        except Exception as e:
            print(f"Error resizing image: {e}")
            return None
    
    @staticmethod
    def compress_image(
        image_path: str,
        output_path: Optional[str] = None,
        target_size_mb: float = 1.0,
        platform: str = "default"
    ) -> Optional[str]:
        """
        Compress image to target size.
        
        Args:
            image_path: Path to input image
            output_path: Path to save compressed image (None = overwrite)
            target_size_mb: Target size in MB
            platform: Platform name for specific limits (telegram, zalo, default)
        
        Returns:
            Path to compressed image or None on error
        """
        if not PIL_AVAILABLE:
            return None
        
        try:
            path = Path(image_path)
            if not path.exists():
                return None
            
            # Get platform-specific max size
            if platform == "telegram":
                max_size = ImageProcessor.TELEGRAM_MAX_SIZE
            elif platform == "zalo":
                max_size = ImageProcessor.ZALO_MAX_SIZE
            else:
                max_size = ImageProcessor.DEFAULT_MAX_SIZE
            
            target_size_bytes = min(int(target_size_mb * 1024 * 1024), max_size)
            current_size = path.stat().st_size
            
            # If already under target, just copy
            if current_size <= target_size_bytes:
                if output_path and output_path != str(path):
                    import shutil
                    shutil.copy2(path, output_path)
                    return output_path
                return str(path)
            
            # Determine output path
            if output_path is None:
                output_path = str(path)
            
            with Image.open(path) as img:
                # Convert RGBA to RGB for JPEG
                if img.mode == 'RGBA':
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[3])
                    img = background
                
                # Try different quality levels
                for quality in [ImageProcessor.DEFAULT_QUALITY, 
                               ImageProcessor.COMPRESSED_QUALITY, 
                               ImageProcessor.HIGH_COMPRESSION_QUALITY]:
                    buffer = io.BytesIO()
                    img.save(buffer, format='JPEG', quality=quality, optimize=True)
                    
                    if buffer.tell() <= target_size_bytes:
                        with open(output_path, 'wb') as f:
                            f.write(buffer.getvalue())
                        return output_path
                
                # If still too large, resize and compress
                scale_factor = (target_size_bytes / current_size) ** 0.5
                new_width = int(img.width * scale_factor)
                new_height = int(img.height * scale_factor)
                
                img.thumbnail((new_width, new_height), Image.Resampling.LANCZOS)
                img.save(output_path, format='JPEG', 
                        quality=ImageProcessor.HIGH_COMPRESSION_QUALITY, 
                        optimize=True)
                
                return output_path
                
        except Exception as e:
            print(f"Error compressing image: {e}")
            return None
    
    @staticmethod
    def convert_to_format(
        image_path: str,
        output_format: str = "JPEG",
        output_path: Optional[str] = None,
        quality: int = DEFAULT_QUALITY
    ) -> Optional[str]:
        """
        Convert image to specified format.
        
        Args:
            image_path: Path to input image
            output_format: Target format (JPEG, PNG, WEBP)
            output_path: Path to save converted image
            quality: Quality for lossy formats
        
        Returns:
            Path to converted image or None on error
        """
        if not PIL_AVAILABLE:
            return None
        
        try:
            path = Path(image_path)
            if not path.exists():
                return None
            
            # Determine output path
            if output_path is None:
                ext = "." + output_format.lower().replace("jpeg", "jpg")
                output_path = str(path.with_suffix(ext))
            
            with Image.open(path) as img:
                # Convert RGBA to RGB for JPEG
                if output_format.upper() in ('JPEG', 'JPG') and img.mode == 'RGBA':
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[3])
                    img = background
                
                save_kwargs = {"format": output_format.upper()}
                if output_format.upper() in ('JPEG', 'JPG', 'WEBP'):
                    save_kwargs["quality"] = quality
                    save_kwargs["optimize"] = True
                
                img.save(output_path, **save_kwargs)
                return output_path
                
        except Exception as e:
            print(f"Error converting image: {e}")
            return None
    
    @staticmethod
    def auto_optimize_for_platform(
        image_path: str,
        platform: str,
        output_path: Optional[str] = None
    ) -> Optional[str]:
        """
        Automatically optimize image for specific platform.
        
        Args:
            image_path: Path to input image
            platform: Platform name (telegram, zalo, default)
            output_path: Path to save optimized image
        
        Returns:
            Path to optimized image or None on error
        """
        if not PIL_AVAILABLE:
            return image_path  # Return original if PIL not available
        
        info = ImageProcessor.get_image_info(image_path)
        if not info:
            return image_path
        
        # Determine if optimization needed
        needs_resize = (info["width"] > ImageProcessor.MAX_WIDTH or 
                       info["height"] > ImageProcessor.MAX_HEIGHT)
        
        if platform == "telegram":
            needs_compress = info["size_bytes"] > ImageProcessor.TELEGRAM_MAX_SIZE
            target_size_mb = 8.0  # Leave some margin
        elif platform == "zalo":
            needs_compress = info["size_bytes"] > ImageProcessor.ZALO_MAX_SIZE
            target_size_mb = 4.0
        else:
            needs_compress = info["size_bytes"] > ImageProcessor.DEFAULT_MAX_SIZE
            target_size_mb = 4.0
        
        # If no optimization needed, return original
        if not needs_resize and not needs_compress:
            return image_path
        
        # Optimize
        if output_path is None:
            # Create temp file
            import tempfile
            suffix = Path(image_path).suffix
            fd, output_path = tempfile.mkstemp(suffix=suffix, prefix="optimized_")
            os.close(fd)
        
        # Resize if needed
        if needs_resize:
            result = ImageProcessor.resize_image(image_path, output_path)
            if not result:
                return image_path
            image_path = result
        
        # Compress if needed
        if needs_compress:
            result = ImageProcessor.compress_image(image_path, output_path, target_size_mb, platform)
            if not result:
                return image_path
            return result
        
        return output_path


# Convenience functions
def optimize_image_for_telegram(image_path: str, output_path: Optional[str] = None) -> Optional[str]:
    """Optimize image for Telegram."""
    return ImageProcessor.auto_optimize_for_platform(image_path, "telegram", output_path)


def optimize_image_for_zalo(image_path: str, output_path: Optional[str] = None) -> Optional[str]:
    """Optimize image for Zalo."""
    return ImageProcessor.auto_optimize_for_platform(image_path, "zalo", output_path)


def get_image_info(image_path: str) -> Optional[dict]:
    """Get image information."""
    return ImageProcessor.get_image_info(image_path)
